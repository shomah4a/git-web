import { execFile } from 'node:child_process'
import { mkdtemp, rm, realpath, writeFile, unlink, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseRevision } from '../../domain/revision.js'
import { CliGitClient } from './cli-client.js'

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
  await execFileAsync(
    'git',
    ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'init'],
    { cwd: dir },
  )
  return dir
}

async function commit(cwd: string, msg: string): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd })
  await execFileAsync('git', ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', msg], {
    cwd,
  })
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

describe('CliGitClient.diffSummary', () => {
  it('変更がない場合は空配列を返す', async () => {
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({ kind: 'working-vs-head' })

    expect(summary).toEqual([])
  })

  it('新規ファイルが added として列挙される', async () => {
    await writeFile(join(tempRepo, 'foo.ts'), 'export const x = 1\n')
    await commit(tempRepo, 'add foo.ts')
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({
      kind: 'rev-vs-rev',
      from: parseRevision('HEAD~1'),
      to: parseRevision('HEAD'),
    })

    expect(summary).toHaveLength(1)
    const file = summary[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.path).toBe('foo.ts')
    expect(file.status).toBe('added')
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(0)
    expect(file.binary).toBe(false)
  })

  it('削除されたファイルが deleted として列挙される', async () => {
    await writeFile(join(tempRepo, 'bar.ts'), 'export const y = 2\n')
    await commit(tempRepo, 'add bar.ts')
    await unlink(join(tempRepo, 'bar.ts'))
    await commit(tempRepo, 'remove bar.ts')
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({
      kind: 'rev-vs-rev',
      from: parseRevision('HEAD~1'),
      to: parseRevision('HEAD'),
    })

    expect(summary).toHaveLength(1)
    expect(summary[0]?.status).toBe('deleted')
  })

  it('rename は初版では modified に丸められ oldPath は null', async () => {
    await writeFile(join(tempRepo, 'old.py'), 'def foo():\n    return 1\n')
    await commit(tempRepo, 'add old.py')
    await rename(join(tempRepo, 'old.py'), join(tempRepo, 'new.py'))
    await commit(tempRepo, 'rename old.py -> new.py')
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({
      kind: 'rev-vs-rev',
      from: parseRevision('HEAD~1'),
      to: parseRevision('HEAD'),
    })

    expect(summary).toHaveLength(1)
    const file = summary[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.path).toBe('new.py')
    expect(file.oldPath).toBeNull()
    expect(file.status).toBe('modified')
  })

  it('-で始まるファイル名も -- 区切りで安全に扱える', async () => {
    // M2 対応: `-foo.ts` のようなファイル名が CLI オプションと誤解されないか
    await writeFile(join(tempRepo, '-foo.ts'), 'export const z = 3\n')
    await commit(tempRepo, 'add dash-prefixed file')
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({
      kind: 'rev-vs-rev',
      from: parseRevision('HEAD~1'),
      to: parseRevision('HEAD'),
    })

    expect(summary).toHaveLength(1)
    expect(summary[0]?.path).toBe('-foo.ts')
  })

  it('バイナリファイル変更は binary: true として返される', async () => {
    const bin1 = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) bin1[i] = i
    await writeFile(join(tempRepo, 'bin.dat'), bin1)
    await commit(tempRepo, 'add binary')
    const bin2 = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) bin2[i] = 255 - i
    await writeFile(join(tempRepo, 'bin.dat'), bin2)
    await commit(tempRepo, 'modify binary')
    const git = new CliGitClient(tempRepo)

    const summary = await git.diffSummary({
      kind: 'rev-vs-rev',
      from: parseRevision('HEAD~1'),
      to: parseRevision('HEAD'),
    })

    expect(summary).toHaveLength(1)
    const file = summary[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.path).toBe('bin.dat')
    expect(file.binary).toBe(true)
    expect(file.additions).toBe(0)
    expect(file.deletions).toBe(0)
  })
})

describe('CliGitClient.diffFile', () => {
  it('変更なしのファイルは空文字列を返す', async () => {
    const git = new CliGitClient(tempRepo)

    const patch = await git.diffFile({ kind: 'working-vs-head' }, 'nonexistent.ts')

    expect(patch).toBe('')
  })

  it('変更されたファイルに対して unified diff を返す', async () => {
    await writeFile(join(tempRepo, 'foo.ts'), 'line1\nline2\nline3\n')
    await commit(tempRepo, 'add foo.ts')
    await writeFile(join(tempRepo, 'foo.ts'), 'line1\nline2-modified\nline3\n')
    await commit(tempRepo, 'modify foo.ts')
    const git = new CliGitClient(tempRepo)

    const patch = await git.diffFile(
      {
        kind: 'rev-vs-rev',
        from: parseRevision('HEAD~1'),
        to: parseRevision('HEAD'),
      },
      'foo.ts',
    )

    expect(patch).toContain('diff --git')
    expect(patch).toContain('-line2')
    expect(patch).toContain('+line2-modified')
  })

  it('-で始まるファイル名も -- 区切りで安全に扱える', async () => {
    await writeFile(join(tempRepo, '-foo.ts'), 'line1\n')
    await commit(tempRepo, 'add dash-prefixed file')
    await writeFile(join(tempRepo, '-foo.ts'), 'line1-modified\n')
    await commit(tempRepo, 'modify dash-prefixed file')
    const git = new CliGitClient(tempRepo)

    const patch = await git.diffFile(
      {
        kind: 'rev-vs-rev',
        from: parseRevision('HEAD~1'),
        to: parseRevision('HEAD'),
      },
      '-foo.ts',
    )

    expect(patch).toContain('-line1')
    expect(patch).toContain('+line1-modified')
  })

  it('バイナリファイルは "Binary files differ" を含むテキストを返す', async () => {
    const bin1 = Buffer.from([0, 1, 2, 3, 4])
    await writeFile(join(tempRepo, 'bin.dat'), bin1)
    await commit(tempRepo, 'add binary')
    const bin2 = Buffer.from([5, 6, 7, 8, 9])
    await writeFile(join(tempRepo, 'bin.dat'), bin2)
    await commit(tempRepo, 'modify binary')
    const git = new CliGitClient(tempRepo)

    const patch = await git.diffFile(
      {
        kind: 'rev-vs-rev',
        from: parseRevision('HEAD~1'),
        to: parseRevision('HEAD'),
      },
      'bin.dat',
    )

    expect(patch).toContain('Binary files')
  })
})
