import { describe, expect, it, vi } from 'vitest'
import type { Revision } from '../../domain/revision.js'
import type { ExecFileFn } from './cat-file-blob-reader.js'
import { createCatFileBlobReader } from './cat-file-blob-reader.js'

const REPO_ROOT = '/home/user/repo'
const REV: Revision = { raw: 'HEAD' }

/**
 * execFile の非ゼロ終了時に Node が投げるエラーを模した擬似 Error。
 * promisify(execFile) が reject で投げる値は ExecFileException だが、
 * 本 adapter は `code` と `stderr` の形だけを見るのでそこだけ模倣する。
 */
class FakeExecFileError extends Error {
  readonly code: number
  readonly stderr: Buffer

  constructor(code: number, stderr: string) {
    super(stderr)
    this.code = code
    this.stderr = Buffer.from(stderr, 'utf8')
  }
}

function okExecFile(stdout: Buffer): ExecFileFn {
  return vi.fn(() => Promise.resolve({ stdout, stderr: Buffer.alloc(0) }))
}

function failingExecFile(code: number, stderr: string): ExecFileFn {
  return vi.fn(() => Promise.reject(new FakeExecFileError(code, stderr)))
}

describe('createCatFileBlobReader', () => {
  it('テキストファイルを読み取って Blob を返す', async () => {
    const exec = okExecFile(Buffer.from('# hello\n', 'utf8'))
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    const result = await reader.read('README.md', REV)

    expect(result).toEqual({
      path: 'README.md',
      rev: REV,
      content: '# hello\n',
      binary: false,
      language: null,
    })
    expect(exec).toHaveBeenCalledTimes(1)
    const call = vi.mocked(exec).mock.calls[0]
    if (call === undefined) {
      throw new Error('exec not called')
    }
    const [file, args, options] = call
    expect(file).toBe('git')
    expect(args).toEqual(['-C', REPO_ROOT, 'cat-file', 'blob', 'HEAD:README.md'])
    expect(options.encoding).toBe('buffer')
    expect(options.maxBuffer).toBe(50 * 1024 * 1024)
    expect(options.env?.LC_ALL).toBe('C')
    expect(options.env?.LANG).toBe('C')
  })

  it('NUL バイトを含む stdout は binary として content を空文字にする', async () => {
    const exec = okExecFile(Buffer.from([0x89, 0x50, 0x00, 0x4e]))
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    const result = await reader.read('image.png', REV)

    expect(result?.binary).toBe(true)
    expect(result?.content).toBe('')
  })

  it("exit 128 かつ stderr が `fatal: path '...' does not exist` なら null を返す", async () => {
    const exec = failingExecFile(128, "fatal: path 'missing.ts' does not exist in 'HEAD'\n")
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    const result = await reader.read('missing.ts', REV)

    expect(result).toBeNull()
  })

  it('exit 128 かつ stderr が `fatal: git cat-file ...: bad file` (ディレクトリ指定) なら null を返す', async () => {
    const exec = failingExecFile(128, 'fatal: git cat-file HEAD:packages: bad file\n')
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    const result = await reader.read('packages', REV)

    expect(result).toBeNull()
  })

  it('exit 128 かつ stderr が `fatal: Not a valid object name` なら null を返す', async () => {
    const exec = failingExecFile(128, 'fatal: Not a valid object name HEAD:ghost\n')
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    const result = await reader.read('ghost', REV)

    expect(result).toBeNull()
  })

  it('exit 128 でも stderr が `fatal: ` で始まらない場合は再 throw する', async () => {
    const exec = failingExecFile(128, 'unexpected: something else\n')
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    await expect(reader.read('a.ts', REV)).rejects.toMatchObject({ code: 128 })
  })

  it('exit code が 128 以外の場合は再 throw する', async () => {
    const exec = failingExecFile(1, 'fatal: some other failure\n')
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    await expect(reader.read('a.ts', REV)).rejects.toMatchObject({ code: 1 })
  })

  it('rev が null の場合は呼ばれるべきでなく Error を投げる', async () => {
    const exec = okExecFile(Buffer.alloc(0))
    const reader = createCatFileBlobReader(exec, REPO_ROOT)

    await expect(reader.read('a.ts', null)).rejects.toThrow(/called with null rev/)
  })
})
