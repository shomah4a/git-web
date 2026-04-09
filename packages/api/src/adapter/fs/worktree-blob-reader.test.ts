import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InvalidDiffPathError } from '../../domain/errors.js'
import type { FsLike } from './worktree-blob-reader.js'
import { createWorktreeBlobReader } from './worktree-blob-reader.js'

const REPO_ROOT = `${sep}home${sep}user${sep}repo`

/**
 * Fake FsLike を組み立てるヘルパ。
 *
 * - realpaths: 入力パス → 解決後パス (未登録は ENOENT)
 * - files: 解決後パス → 返す Buffer (未登録は ENOENT)
 */
function createFakeFs(
  realpaths: Readonly<Record<string, string>>,
  files: Readonly<Record<string, Buffer>>,
): FsLike {
  return {
    realpath: (p: string) =>
      new Promise((resolvePromise, rejectPromise) => {
        const resolved = realpaths[p]
        if (resolved === undefined) {
          const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file, realpath ${p}`)
          err.code = 'ENOENT'
          rejectPromise(err)
          return
        }
        resolvePromise(resolved)
      }),
    readFile: (p: string) =>
      new Promise((resolvePromise, rejectPromise) => {
        const buf = files[p]
        if (buf === undefined) {
          const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file, readFile ${p}`)
          err.code = 'ENOENT'
          rejectPromise(err)
          return
        }
        resolvePromise(buf)
      }),
  }
}

describe('createWorktreeBlobReader', () => {
  it('通常のテキストファイルを読み取って Blob を返す', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
        [`${REPO_ROOT}${sep}README.md`]: `${REPO_ROOT}${sep}README.md`,
      },
      {
        [`${REPO_ROOT}${sep}README.md`]: Buffer.from('# hello\n', 'utf8'),
      },
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    const result = await reader.read('README.md', null)

    expect(result).toEqual({
      path: 'README.md',
      rev: null,
      content: '# hello\n',
      binary: false,
      language: null,
    })
  })

  it('NUL バイトを含むファイルは binary として content を空文字にする', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
        [`${REPO_ROOT}${sep}image.bin`]: `${REPO_ROOT}${sep}image.bin`,
      },
      {
        [`${REPO_ROOT}${sep}image.bin`]: Buffer.from([0x89, 0x50, 0x00, 0x4e]),
      },
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    const result = await reader.read('image.bin', null)

    expect(result?.binary).toBe(true)
    expect(result?.content).toBe('')
  })

  it('ファイル未存在 (realpath の ENOENT) は null を返す', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
      },
      {},
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    const result = await reader.read('missing.ts', null)

    expect(result).toBeNull()
  })

  it('ファイル未存在 (readFile の ENOENT) は null を返す', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
        // realpath は解決するが readFile で ENOENT になるケース
        [`${REPO_ROOT}${sep}ghost.ts`]: `${REPO_ROOT}${sep}ghost.ts`,
      },
      {},
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    const result = await reader.read('ghost.ts', null)

    expect(result).toBeNull()
  })

  it('symlink で repo 外を指すパスは InvalidDiffPathError を投げる', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
        // link.ts は /etc/passwd に解決される symlink
        [`${REPO_ROOT}${sep}link.ts`]: `${sep}etc${sep}passwd`,
      },
      {
        [`${sep}etc${sep}passwd`]: Buffer.from('root:x:0:0'),
      },
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    await expect(reader.read('link.ts', null)).rejects.toBeInstanceOf(InvalidDiffPathError)
  })

  it('.. segment を含むパスは parseDiffPath の時点で拒否される', async () => {
    const fs = createFakeFs({ [REPO_ROOT]: REPO_ROOT }, {})
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    await expect(reader.read('../escape.ts', null)).rejects.toBeInstanceOf(InvalidDiffPathError)
  })

  it('rev が null でない場合は呼ばれるべきでなく Error を投げる', async () => {
    const fs = createFakeFs({ [REPO_ROOT]: REPO_ROOT }, {})
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    await expect(reader.read('a.ts', { raw: 'HEAD' })).rejects.toThrow(/called with non-null rev/)
  })

  it('symlink 越しに repo 内のファイルを指す場合は許可される', async () => {
    const fs = createFakeFs(
      {
        [REPO_ROOT]: REPO_ROOT,
        [`${REPO_ROOT}${sep}alias.ts`]: `${REPO_ROOT}${sep}src${sep}real.ts`,
      },
      {
        [`${REPO_ROOT}${sep}src${sep}real.ts`]: Buffer.from('ok'),
      },
    )
    const reader = createWorktreeBlobReader(REPO_ROOT, fs)

    const result = await reader.read('alias.ts', null)

    expect(result?.content).toBe('ok')
  })
})
