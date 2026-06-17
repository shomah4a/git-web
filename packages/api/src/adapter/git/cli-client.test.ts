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
  it('ブランチ上ではcommitHashとbranch名を返す', async () => {
    const git = new CliGitClient(tempRepo)

    const head = await git.head()

    expect(head.commitHash).toMatch(/^[0-9a-f]{7,12}$/)
    expect(head.branch).toBe('main')
  })

  it('detached HEADではbranchがnullになる', async () => {
    const git = new CliGitClient(tempRepo)
    await execFileAsync('git', ['checkout', '--detach'], { cwd: tempRepo })

    const head = await git.head()

    expect(head.commitHash).toMatch(/^[0-9a-f]{7,12}$/)
    expect(head.branch).toBeNull()
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

describe('CliGitClient.listBranches / listTags', () => {
  it('空リポジトリでは_listBranches_が空配列を返す', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'git-web-cli-empty-'))
    try {
      await execFileAsync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: emptyDir })
      const git = new CliGitClient(emptyDir)

      const branches = await git.listBranches()
      expect(branches).toEqual([])

      const tags = await git.listTags()
      expect(tags).toEqual([])
    } finally {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })

  it('listBranches_が複数ブランチを_refname_昇順で返す', async () => {
    // main 以外のブランチを作る
    await execFileAsync('git', ['branch', 'feature/foo'], { cwd: tempRepo })
    await execFileAsync('git', ['branch', 'release-1.0'], { cwd: tempRepo })
    const git = new CliGitClient(tempRepo)

    const branches = await git.listBranches()

    expect(branches).toEqual(['feature/foo', 'main', 'release-1.0'])
  })

  it('listTags が複数タグを返す', async () => {
    await execFileAsync('git', ['tag', 'v1.0.0'], { cwd: tempRepo })
    await execFileAsync('git', ['tag', 'v0.9.0'], { cwd: tempRepo })
    const git = new CliGitClient(tempRepo)

    const tags = await git.listTags()

    // refname 昇順
    expect(tags).toEqual(['v0.9.0', 'v1.0.0'])
  })

  it('listBranches は refs/tags/ 以下を含まない', async () => {
    await execFileAsync('git', ['tag', 'v1.0.0'], { cwd: tempRepo })
    const git = new CliGitClient(tempRepo)

    const branches = await git.listBranches()

    expect(branches).toEqual(['main'])
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

describe('CliGitClient.log', () => {
  it('HEAD からのコミット履歴を取得できる', async () => {
    await writeFile(join(tempRepo, 'a.ts'), 'const a = 1\n')
    await commit(tempRepo, 'add a.ts')
    const git = new CliGitClient(tempRepo)

    const result = await git.log({
      rev: parseRevision('HEAD'),
      limit: 10,
      after: null,
      path: null,
    })

    // init + add a.ts = 2 コミット
    expect(result.commits).toHaveLength(2)
    expect(result.hasMore).toBe(false)
    const first = result.commits[0]
    if (first === undefined) throw new Error('expected first commit')
    expect(first.subject).toBe('add a.ts')
    expect(first.stats.filesChanged).toBe(1)
    expect(first.stats.insertions).toBe(1)
  })

  it('limit 指定で取得件数を制限し hasMore が true になる', async () => {
    await writeFile(join(tempRepo, 'a.ts'), 'a\n')
    await commit(tempRepo, 'commit 1')
    await writeFile(join(tempRepo, 'b.ts'), 'b\n')
    await commit(tempRepo, 'commit 2')
    await writeFile(join(tempRepo, 'c.ts'), 'c\n')
    await commit(tempRepo, 'commit 3')
    const git = new CliGitClient(tempRepo)

    const result = await git.log({
      rev: parseRevision('HEAD'),
      limit: 2,
      after: null,
      path: null,
    })

    expect(result.commits).toHaveLength(2)
    expect(result.hasMore).toBe(true)
    const first = result.commits[0]
    if (first === undefined) throw new Error('expected first commit')
    expect(first.subject).toBe('commit 3')
  })

  it('after 指定で 2 ページ目のコミットが取得できる', async () => {
    await writeFile(join(tempRepo, 'a.ts'), 'a\n')
    await commit(tempRepo, 'commit 1')
    await writeFile(join(tempRepo, 'b.ts'), 'b\n')
    await commit(tempRepo, 'commit 2')
    await writeFile(join(tempRepo, 'c.ts'), 'c\n')
    await commit(tempRepo, 'commit 3')
    const git = new CliGitClient(tempRepo)

    // 1 ページ目: 2 件取得
    const page1 = await git.log({
      rev: parseRevision('HEAD'),
      limit: 2,
      after: null,
      path: null,
    })
    expect(page1.commits).toHaveLength(2)
    expect(page1.hasMore).toBe(true)

    // 2 ページ目: 末尾の SHA をカーソルに
    const lastCommit = page1.commits[1]
    if (lastCommit === undefined) throw new Error('expected last commit')

    const page2 = await git.log({
      rev: parseRevision('HEAD'),
      limit: 2,
      after: lastCommit.hash,
      path: null,
    })

    // init + commit 1 の 2 件のうち commit 1 と init
    expect(page2.commits).toHaveLength(2)
    expect(page2.hasMore).toBe(false)
    // page2 のコミットが page1 と重複しないことを検証
    const page1Hashes = new Set(page1.commits.map((c) => c.hash))
    for (const c of page2.commits) {
      expect(page1Hashes.has(c.hash)).toBe(false)
    }
  })

  it('path 指定で特定ファイルの履歴のみ取得できる', async () => {
    await writeFile(join(tempRepo, 'a.ts'), 'a\n')
    await commit(tempRepo, 'add a.ts')
    await writeFile(join(tempRepo, 'b.ts'), 'b\n')
    await commit(tempRepo, 'add b.ts')
    const git = new CliGitClient(tempRepo)

    const result = await git.log({
      rev: parseRevision('HEAD'),
      limit: 10,
      after: null,
      path: 'a.ts',
    })

    expect(result.commits).toHaveLength(1)
    const first = result.commits[0]
    if (first === undefined) throw new Error('expected first commit')
    expect(first.subject).toBe('add a.ts')
  })
})

describe('CliGitClient.lastCommitsByName', () => {
  it('targetNames が空なら空 Map を返し git を呼ばない', async () => {
    const git = new CliGitClient(tempRepo)

    const result = await git.lastCommitsByName(parseRevision('HEAD'), '', new Set(), 1000)

    expect(result.size).toBe(0)
  })

  it('ルート直下のファイルとディレクトリそれぞれに最終コミットを割り当てる', async () => {
    await writeFile(join(tempRepo, 'README.md'), 'r1\n')
    await commit(tempRepo, 'add README')
    await writeFile(join(tempRepo, 'README.md'), 'r1\nr2\n')
    await commit(tempRepo, 'update README')
    const srcDir = join(tempRepo, 'src')
    await execFileAsync('mkdir', ['-p', srcDir])
    await writeFile(join(srcDir, 'foo.ts'), 'f1\n')
    await commit(tempRepo, 'add src/foo.ts')

    const git = new CliGitClient(tempRepo)
    const result = await git.lastCommitsByName(
      parseRevision('HEAD'),
      '',
      new Set(['README.md', 'src']),
      1000,
    )

    expect(result.size).toBe(2)
    expect(result.get('README.md')?.subject).toBe('update README')
    expect(result.get('src')?.subject).toBe('add src/foo.ts')
  })

  it('サブディレクトリ指定時は配下の immediate child のみ追跡する', async () => {
    const srcDir = join(tempRepo, 'src')
    await execFileAsync('mkdir', ['-p', srcDir])
    await writeFile(join(srcDir, 'a.ts'), 'a\n')
    await commit(tempRepo, 'add src/a.ts')
    await writeFile(join(srcDir, 'b.ts'), 'b\n')
    await commit(tempRepo, 'add src/b.ts')

    const git = new CliGitClient(tempRepo)
    const result = await git.lastCommitsByName(
      parseRevision('HEAD'),
      'src',
      new Set(['a.ts', 'b.ts']),
      1000,
    )

    expect(result.get('a.ts')?.subject).toBe('add src/a.ts')
    expect(result.get('b.ts')?.subject).toBe('add src/b.ts')
  })

  it('履歴に現れない name は返却 Map に含めない', async () => {
    await writeFile(join(tempRepo, 'a.ts'), 'a\n')
    await commit(tempRepo, 'add a.ts')

    const git = new CliGitClient(tempRepo)
    const result = await git.lastCommitsByName(
      parseRevision('HEAD'),
      '',
      new Set(['a.ts', 'missing.ts']),
      1000,
    )

    expect(result.has('a.ts')).toBe(true)
    expect(result.has('missing.ts')).toBe(false)
  })

  it('深い階層下のファイル変更でも immediate child (サブディレクトリ名) に集約される', async () => {
    const deepDir = join(tempRepo, 'src', 'deep')
    await execFileAsync('mkdir', ['-p', deepDir])
    await writeFile(join(deepDir, 'x.ts'), 'x\n')
    await commit(tempRepo, 'add src/deep/x.ts')

    const git = new CliGitClient(tempRepo)
    const result = await git.lastCommitsByName(parseRevision('HEAD'), '', new Set(['src']), 1000)

    expect(result.get('src')?.subject).toBe('add src/deep/x.ts')
  })

  it('マージコミットはスキップしファイル内容を変更したコミットを返す', async () => {
    await writeFile(join(tempRepo, 'base.ts'), 'b\n')
    await commit(tempRepo, 'add base.ts')

    // feature ブランチで変更
    await execFileAsync('git', ['checkout', '-b', 'feature'], { cwd: tempRepo })
    await writeFile(join(tempRepo, 'feature.ts'), 'f\n')
    await commit(tempRepo, 'add feature.ts on feature')

    // main に戻ってマージ (--no-ff でマージコミット生成)
    await execFileAsync('git', ['checkout', 'main'], { cwd: tempRepo })
    await execFileAsync(
      'git',
      ['-c', 'commit.gpgsign=false', 'merge', '--no-ff', '-m', 'Merge feature', 'feature'],
      { cwd: tempRepo },
    )

    const git = new CliGitClient(tempRepo)
    const result = await git.lastCommitsByName(
      parseRevision('HEAD'),
      '',
      new Set(['feature.ts']),
      1000,
    )

    // --no-merges により "Merge feature" は飛ばされ、内容変更のあった
    // feature ブランチ側コミットが採用される (ADR 0054 §2)
    expect(result.get('feature.ts')?.subject).toBe('add feature.ts on feature')
  })
})

describe('CliGitClient.resolveCommitSha', () => {
  it('HEADを40桁のcommit SHAに解決する', async () => {
    const git = new CliGitClient(tempRepo)

    const sha = await git.resolveCommitSha(parseRevision('HEAD'))

    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('短縮SHAを40桁に解決する', async () => {
    const git = new CliGitClient(tempRepo)
    const full = await git.resolveCommitSha(parseRevision('HEAD'))
    const short = full.slice(0, 8)

    const resolved = await git.resolveCommitSha(parseRevision(short))

    expect(resolved).toBe(full)
  })

  it('存在しないリビジョンでは例外を投げる', async () => {
    const git = new CliGitClient(tempRepo)

    await expect(git.resolveCommitSha(parseRevision('deadbeef'))).rejects.toThrow()
  })
})
