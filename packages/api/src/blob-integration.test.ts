/**
 * /api/blob エンドポイントの end-to-end 統合テスト。
 *
 * 本物の git リポジトリを mkdtemp で作成し、ファイルを commit してから
 * main.start() でサーバを起動し、fetch で各種ケースを検証する。
 *
 * 単体テストで既にカバー済みの分岐 (stderr パターン、isInsideRepo、
 * parseDiffPath) はここでは扱わない。ここで担保したいのは「ルート配線 +
 * DI が本物の子プロセス / fs とつながること」。
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { start, type StartedServer } from './main.js'

const execFileAsync = promisify(execFile)

let repoDir: string
let server: StartedServer

async function runGit(cwd: string, args: ReadonlyArray<string>): Promise<void> {
  await execFileAsync('git', [...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      LC_ALL: 'C',
      LANG: 'C',
    },
  })
}

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'git-web-blob-integ-'))

  await runGit(repoDir, ['init', '-q', '-b', 'main'])
  await writeFile(join(repoDir, 'README.md'), '# test\n')
  // NUL バイトを含む擬似 binary ファイル
  await writeFile(join(repoDir, 'image.bin'), Buffer.from([0x89, 0x50, 0x00, 0x4e]))
  // 拡張子から language が推定されない平文
  await writeFile(join(repoDir, 'a.txt'), 'plain\n')
  // ディレクトリ指定 (tree object) を cat-file blob が拒否することを
  // 実証するためのサブディレクトリ。`src` 自体は tree object となる
  await mkdir(join(repoDir, 'src'))
  await writeFile(join(repoDir, 'src', 'inner.ts'), 'export const x = 1\n')

  await runGit(repoDir, ['add', 'README.md', 'image.bin', 'a.txt', 'src/inner.ts'])
  await runGit(repoDir, ['commit', '-q', '-m', 'initial'])

  // worktree 状態で README.md を変更 (worktree と HEAD で内容が違うことを
  // 確認するため)
  await writeFile(join(repoDir, 'README.md'), '# test\n\nmodified in worktree\n')

  server = await start({ cwd: repoDir })
})

afterAll(async () => {
  await server.close()
  await rm(repoDir, { recursive: true, force: true })
})

describe('GET /api/blob (integration)', () => {
  it('rev クエリなしは worktree の内容を返す', async () => {
    const res = await fetch(`${server.url}/api/blob?path=README.md`)

    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    expect(body).toMatchObject({
      path: 'README.md',
      rev: null,
      binary: false,
      language: 'markdown',
    })
    if (
      typeof body !== 'object' ||
      body === null ||
      !('content' in body) ||
      typeof body.content !== 'string'
    ) {
      throw new Error('unexpected body shape')
    }
    expect(body.content).toContain('modified in worktree')
  })

  it('rev=HEAD は HEAD の内容を返す (worktree の変更は含まれない)', async () => {
    const res = await fetch(`${server.url}/api/blob?path=README.md&rev=HEAD`)

    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('content' in body) ||
      typeof body.content !== 'string'
    ) {
      throw new Error('unexpected body shape')
    }
    expect(body.content).toBe('# test\n')
    expect(body).toMatchObject({ rev: 'HEAD' })
  })

  it('NUL バイトを含むファイルは binary: true, content: "" で返る', async () => {
    const res = await fetch(`${server.url}/api/blob?path=image.bin&rev=HEAD`)

    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    expect(body).toMatchObject({ binary: true, content: '', language: null })
  })

  it('存在しないパスは 404', async () => {
    const res = await fetch(`${server.url}/api/blob?path=does-not-exist.txt`)
    expect(res.status).toBe(404)
  })

  it('存在しないパス + rev も 404', async () => {
    const res = await fetch(`${server.url}/api/blob?path=ghost.ts&rev=HEAD`)
    expect(res.status).toBe(404)
  })

  it('サブディレクトリ配下のファイルは rev=HEAD で取得できる', async () => {
    const res = await fetch(`${server.url}/api/blob?path=src/inner.ts&rev=HEAD`)

    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    expect(body).toMatchObject({
      path: 'src/inner.ts',
      rev: 'HEAD',
      language: 'typescript',
    })
  })

  it('ディレクトリ (tree object) を rev 付きで指定すると 404', async () => {
    // git cat-file blob HEAD:src は tree object を受けて
    // `fatal: git cat-file ...: bad file` で非ゼロ終了するため 404 にマップされる。
    // git show HEAD:src だと tree listing を 200 で返してしまう事故が起きる
    // ので、本エンドポイントが cat-file blob を使っていることの回帰テストを
    // 兼ねる (ADR 0016)
    const res = await fetch(`${server.url}/api/blob?path=src&rev=HEAD`)
    expect(res.status).toBe(404)
  })

  it('存在しないサブパスも 404', async () => {
    const res = await fetch(`${server.url}/api/blob?path=nope/sub/file.ts&rev=HEAD`)
    expect(res.status).toBe(404)
  })

  it('path クエリが無い場合は 400', async () => {
    const res = await fetch(`${server.url}/api/blob`)
    expect(res.status).toBe(400)
  })

  it('.. segment を含む path は 400', async () => {
    const res = await fetch(`${server.url}/api/blob?path=${encodeURIComponent('../etc/passwd')}`)
    expect(res.status).toBe(400)
  })

  it('rev=<空文字> は 400', async () => {
    const res = await fetch(`${server.url}/api/blob?path=README.md&rev=`)
    expect(res.status).toBe(400)
  })

  it('rev=<シェルメタ混入> は 400', async () => {
    // ADR 0018 で main / ブランチ名は許可されたため、
    // 明示的に拒否される形を使う
    const res = await fetch(
      `${server.url}/api/blob?path=README.md&rev=${encodeURIComponent('HEAD;')}`,
    )
    expect(res.status).toBe(400)
  })

  it('未知拡張子のファイルは language: null', async () => {
    const res = await fetch(`${server.url}/api/blob?path=a.txt&rev=HEAD`)
    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    expect(body).toMatchObject({ language: null })
  })
})
