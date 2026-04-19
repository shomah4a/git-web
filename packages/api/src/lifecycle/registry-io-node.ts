/**
 * registry.ts の RegistryIO / LivenessChecks を Node ランタイムに結線する。
 *
 * - XDG Base Directory Specification に従ってレジストリパスを解決する
 * - atomic rename によるファイル書き込み
 * - `wx` フラグによる短期 lock（リトライつき）
 * - `process.kill(pid, 0)` による PID alive 判定
 * - `node:http` による /api/repo ヘルスチェック
 */

import { request as httpRequest } from 'node:http'
import { homedir } from 'node:os'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import type { LivenessChecks, Logger, Registry, RegistryIO } from './registry.js'
import { EMPTY_REGISTRY } from './registry.js'

export const REGISTRY_FILE_NAME = 'instances.json'
export const REGISTRY_LOCK_NAME = 'instances.json.lock'
const REGISTRY_DIR_MODE = 0o700
const REGISTRY_FILE_MODE = 0o600
const LOCK_RETRY_INTERVAL_MS = 50
const LOCK_MAX_RETRIES = 10
const HTTP_CHECK_TIMEOUT_MS = 500

/**
 * レジストリディレクトリのパスを解決する。
 *
 * 優先順:
 *   1. `XDG_STATE_HOME` が定義されていれば `${XDG_STATE_HOME}/git-web`
 *   2. Windows の場合 `LOCALAPPDATA` があれば `${LOCALAPPDATA}/git-web`
 *   3. fallback: `~/.local/state/git-web`
 */
export function resolveRegistryDir(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string,
): string {
  const xdg = env['XDG_STATE_HOME']
  if (typeof xdg === 'string' && xdg !== '') {
    return join(xdg, 'git-web')
  }
  if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA']
    if (typeof localAppData === 'string' && localAppData !== '') {
      return join(localAppData, 'git-web')
    }
  }
  return join(home, '.local', 'state', 'git-web')
}

/**
 * カレントプロセス環境でのレジストリ / ロックファイルパスを返す。
 */
export function resolveRegistryPaths(): { dir: string; filePath: string; lockPath: string } {
  const dir = resolveRegistryDir(process.env, process.platform, homedir())
  return {
    dir,
    filePath: join(dir, REGISTRY_FILE_NAME),
    lockPath: join(dir, REGISTRY_LOCK_NAME),
  }
}

/**
 * ENOENT のような `code` プロパティをもつエラーかどうかを判定する。
 */
function hasCode(value: unknown, code: string): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  if (!('code' in value)) {
    return false
  }
  return value.code === code
}

/**
 * Node 実装の RegistryIO を作る。
 */
export function createNodeRegistryIO(logger: Logger): RegistryIO {
  return {
    async readFile(path: string): Promise<string | null> {
      try {
        return await readFile(path, 'utf8')
      } catch (err) {
        if (hasCode(err, 'ENOENT')) {
          return null
        }
        throw err
      }
    },

    async writeFileAtomic(path: string, content: string): Promise<void> {
      const dir = dirname(path)
      await mkdir(dir, { recursive: true, mode: REGISTRY_DIR_MODE })
      const tmpPath = `${path}.${process.pid.toString()}.${Date.now().toString()}.tmp`
      try {
        await writeFile(tmpPath, content, { mode: REGISTRY_FILE_MODE })
        await rename(tmpPath, path)
        await chmod(path, REGISTRY_FILE_MODE)
      } catch (err) {
        await unlink(tmpPath).catch(() => {
          // 一時ファイルの消し忘れは無視する
        })
        throw err
      }
    },

    async acquireLock(lockPath: string): Promise<() => Promise<void>> {
      await mkdir(dirname(lockPath), { recursive: true, mode: REGISTRY_DIR_MODE })
      for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
        try {
          const fd = openSync(lockPath, 'wx', REGISTRY_FILE_MODE)
          closeSync(fd)
          return async (): Promise<void> => {
            await unlink(lockPath).catch((err: unknown) => {
              logger.warn(
                `failed to release registry lock: ${err instanceof Error ? err.message : String(err)}`,
              )
            })
          }
        } catch (err) {
          if (!hasCode(err, 'EEXIST')) {
            throw err
          }
        }
        await delay(LOCK_RETRY_INTERVAL_MS)
      }
      throw new Error(
        `failed to acquire registry lock after ${LOCK_MAX_RETRIES.toString()} retries: ${lockPath}`,
      )
    },
  }
}

/**
 * Node 実装の LivenessChecks を作る。
 */
export function createNodeLivenessChecks(): LivenessChecks {
  return {
    pidAlive(pid: number): boolean {
      if (!Number.isInteger(pid) || pid <= 0) {
        return false
      }
      try {
        process.kill(pid, 0)
        return true
      } catch (err) {
        if (hasCode(err, 'EPERM')) {
          return true
        }
        return false
      }
    },
    httpCheck(url: string, timeoutMs: number): Promise<boolean> {
      return nodeHttpCheck(url, timeoutMs)
    },
    httpTimeoutMs: HTTP_CHECK_TIMEOUT_MS,
  }
}

/**
 * `process.on('exit')` から呼ぶ同期版の registry reader。
 * ファイル欠損 / JSON 壊れは空レジストリとして扱い、例外は投げない。
 */
export function readRegistrySync(filePath: string): Registry {
  try {
    const content = readFileSync(filePath, 'utf8')
    const parsed: unknown = JSON.parse(content)
    if (isPlainObject(parsed) && parsed['version'] === 1 && isPlainObject(parsed['instances'])) {
      const instances: Record<
        string,
        { port: number; pid: number; url: string; startedAt: string }
      > = {}
      for (const [key, value] of Object.entries(parsed['instances'])) {
        if (
          isPlainObject(value) &&
          typeof value['port'] === 'number' &&
          typeof value['pid'] === 'number' &&
          typeof value['url'] === 'string' &&
          typeof value['startedAt'] === 'string'
        ) {
          instances[key] = {
            port: value['port'],
            pid: value['pid'],
            url: value['url'],
            startedAt: value['startedAt'],
          }
        }
      }
      return { version: 1, instances }
    }
    return EMPTY_REGISTRY
  } catch {
    return EMPTY_REGISTRY
  }
}

/**
 * `process.on('exit')` から呼ぶ同期版の registry writer。
 * 失敗しても例外は投げない（保険経路）。
 */
export function writeRegistrySync(filePath: string, content: string): void {
  try {
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true, mode: REGISTRY_DIR_MODE })
    const tmpPath = `${filePath}.${process.pid.toString()}.${Date.now().toString()}.exit.tmp`
    try {
      writeFileSync(tmpPath, content, { mode: REGISTRY_FILE_MODE })
      renameSync(tmpPath, filePath)
      chmodSync(filePath, REGISTRY_FILE_MODE)
    } catch {
      try {
        unlinkSync(tmpPath)
      } catch {
        // noop
      }
    }
  } catch {
    // noop
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * GET url?/api/repo に timeoutMs でアクセスし、200 応答なら true を返す。
 *
 * - URL の origin 部分のみ使用する（パスに /api/repo を連結）
 * - タイムアウト、ソケットエラー、非 2xx 応答のいずれも false
 */
export function nodeHttpCheck(baseUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL
    try {
      parsed = new URL('/api/repo', baseUrl)
    } catch {
      resolve(false)
      return
    }

    let finished = false
    const finish = (result: boolean): void => {
      if (finished) {
        return
      }
      finished = true
      resolve(result)
    }

    const req = httpRequest(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
      },
      (res) => {
        const status = res.statusCode ?? 0
        res.resume()
        finish(status >= 200 && status < 300)
      },
    )
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      finish(false)
    })
    req.on('error', () => {
      finish(false)
    })
    req.end()
  })
}
