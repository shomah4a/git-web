import { execFile } from 'node:child_process'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliGitClient } from './git.js'

const execFileAsync = promisify(execFile)

/**
 * 一時ディレクトリに最小構成の git リポジトリを作る。
 * - main ブランチで初期化
 * - user.email / user.name を設定（system 設定に依らないため）
 * - 空コミットを 1 つ作って HEAD が確定するようにする
 */
async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'git-web-cli-test-'))
  await execFileAsync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'test'], { cwd: dir })
  await execFileAsync('git', ['commit', '--quiet', '--allow-empty', '-m', 'init'], { cwd: dir })
  return dir
}

let tempRepo: string

beforeEach(async () => {
  tempRepo = await createTempRepo()
})

afterEach(async () => {
  await rm(tempRepo, { recursive: true, force: true })
})

describe('CliGitClient.head', () => {
  it('40文字のSHA1ハッシュを返す', async () => {
    const git = new CliGitClient(tempRepo)

    const head = await git.head()

    expect(head).toMatch(/^[0-9a-f]{40}$/)
  })

  it('cwdがリポジトリ外の場合は例外を投げる', async () => {
    const git = new CliGitClient(tmpdir())

    await expect(git.head()).rejects.toThrow()
  })
})

describe('CliGitClient.repoRoot', () => {
  it('初期化したディレクトリの絶対パスを返す', async () => {
    const git = new CliGitClient(tempRepo)

    const root = await git.repoRoot()

    // tmpdir が /tmp の symlink である環境（macOS の /private/tmp 等）に
    // 配慮して双方を realpath で正規化してから比較する
    expect(await realpath(root)).toBe(await realpath(tempRepo))
  })

  it('リポジトリ外のディレクトリでは例外を投げる', async () => {
    const git = new CliGitClient(tmpdir())

    await expect(git.repoRoot()).rejects.toThrow()
  })
})
