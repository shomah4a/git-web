/**
 * bin/git-web の SIGINT シャットダウンに関する統合テスト。
 *
 * ADR 0045 の決定（graceful を放棄し即時 exit する）を回帰的に保証する。
 *
 * 検証内容:
 *   - git-web を子プロセスとして起動
 *   - HTTP keep-alive 接続を 1 本張ってブラウザで開いた状態を模擬
 *   - SIGINT を送信
 *   - 1s 以内に exit code 0 で落ちること
 *
 * 前提: packages/api/dist/main.js と packages/front/dist が存在すること
 * （./bin/pnpm check のフローでは build → test の順なので常に満たされる）。
 * 未ビルドのローカル環境ではテストを skip する。
 */

import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const thisFile = fileURLToPath(import.meta.url)
const apiRoot = resolve(dirname(thisFile), '..')
const repoRoot = resolve(apiRoot, '..', '..')
const binPath = resolve(repoRoot, 'bin', 'git-web')
const apiDistPath = resolve(repoRoot, 'packages', 'api', 'dist', 'main.js')
const frontDistPath = resolve(repoRoot, 'packages', 'front', 'dist')

const distReady = existsSync(apiDistPath) && existsSync(frontDistPath)

async function initGitRepo(dir: string): Promise<void> {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    LC_ALL: 'C',
    LANG: 'C',
  }
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: gitEnv })
  await writeFile(join(dir, 'README.md'), '# test\n')
  await execFileAsync('git', ['add', 'README.md'], { cwd: dir, env: gitEnv })
  await execFileAsync('git', ['commit', '-q', '-m', 'initial'], { cwd: dir, env: gitEnv })
}

async function waitForListeningUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((res, rej) => {
    let buf = ''
    let settled = false
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8')
      const match = buf.match(/git-web listening on (\S+)/)
      if (match !== null && match[1] !== undefined && !settled) {
        settled = true
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        child.off('exit', onExit)
        res(match[1])
      }
    }
    const onExit = (): void => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        rej(new Error(`child exited before listening; stdout=${buf}`))
      }
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.stdout?.off('data', onData)
        child.off('exit', onExit)
        rej(new Error(`timeout waiting for listening line; stdout=${buf}`))
      }
    }, timeoutMs)
    child.stdout?.on('data', onData)
    child.once('exit', onExit)
  })
}

async function openKeepAliveRequest(port: number): Promise<Socket> {
  return new Promise((res, rej) => {
    const sock = createConnection({ port, host: '127.0.0.1' }, () => {
      sock.write(
        `GET /api/repo HTTP/1.1\r\nHost: 127.0.0.1:${port.toString()}\r\nConnection: keep-alive\r\n\r\n`,
      )
    })
    sock.once('data', () => res(sock))
    sock.once('error', rej)
  })
}

async function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout waiting for child exit`)), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      res({ code, signal })
    })
  })
}

describe('bin/git-web shutdown', () => {
  let repoDir: string
  let stateDir: string
  let child: ChildProcess | null
  let keepAliveSock: Socket | null

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'git-web-shutdown-repo-'))
    stateDir = await mkdtemp(join(tmpdir(), 'git-web-shutdown-state-'))
    child = null
    keepAliveSock = null
    await initGitRepo(repoDir)
  })

  afterEach(async () => {
    if (keepAliveSock !== null && !keepAliveSock.destroyed) {
      keepAliveSock.destroy()
    }
    if (child !== null && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
    await rm(repoDir, { recursive: true, force: true })
    await rm(stateDir, { recursive: true, force: true })
  })

  it.skipIf(!distReady)(
    'keep-alive 接続を保持した状態でも SIGINT で 1s 以内に exit する',
    async () => {
      // PATH を絞って openBrowser の cmd.exe / xdg-open を確実に失敗させる
      // （テスト実行中に実ブラウザを開かないため）。
      child = spawn(process.execPath, [binPath], {
        cwd: repoDir,
        env: {
          PATH: '/usr/bin:/bin',
          XDG_STATE_HOME: stateDir,
          HOME: stateDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const url = await waitForListeningUrl(child, 10_000)
      const port = Number(new URL(url).port)
      keepAliveSock = await openKeepAliveRequest(port)

      const start = Date.now()
      child.kill('SIGINT')
      const result = await waitForChildExit(child, 2000)
      const elapsedMs = Date.now() - start

      expect(result.code).toBe(0)
      expect(elapsedMs).toBeLessThan(1000)
    },
    15_000,
  )
})
