import { describe, expect, it } from 'vitest'
import { parseRevision } from '../domain/revision.js'
import { InvalidDiffPathError } from '../domain/errors.js'
import { createRawBlobReader } from './raw-blob-reader-composite.js'

function fakeRealpath(mapping: Record<string, string>) {
  return (path: string): Promise<string> => {
    const resolved = mapping[path]
    if (resolved === undefined) {
      const err = new Error(`ENOENT: ${path}`)
      Object.assign(err, { code: 'ENOENT' })
      return Promise.reject(err)
    }
    return Promise.resolve(resolved)
  }
}

function fakeReadFile(files: Record<string, Buffer>) {
  return (path: string): Promise<Buffer> => {
    const buf = files[path]
    if (buf === undefined) {
      const err = new Error(`ENOENT: ${path}`)
      Object.assign(err, { code: 'ENOENT' })
      return Promise.reject(err)
    }
    return Promise.resolve(buf)
  }
}

describe('createRawBlobReader', () => {
  const repoRoot = '/repo'
  const realpathMap: Record<string, string> = {
    '/repo': '/repo',
    '/repo/image.png': '/repo/image.png',
    '/repo/link-outside': '/outside/secret.txt',
  }
  const fileMap: Record<string, Buffer> = {
    '/repo/image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  }

  it('worktree モードでファイルを読み取る', async () => {
    const reader = createRawBlobReader(
      repoRoot,
      fakeRealpath(realpathMap),
      fakeReadFile(fileMap),
      () => Promise.resolve(null),
    )
    const result = await reader.read('image.png', null)
    expect(result).not.toBeNull()
    expect(result?.buffer).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })

  it('worktree モードでリポジトリ外シンボリックリンクを拒否する', async () => {
    const reader = createRawBlobReader(
      repoRoot,
      fakeRealpath(realpathMap),
      fakeReadFile(fileMap),
      () => Promise.resolve(null),
    )
    await expect(reader.read('link-outside', null)).rejects.toThrow(InvalidDiffPathError)
  })

  it('worktree モードで存在しないファイルは null を返す', async () => {
    const reader = createRawBlobReader(
      repoRoot,
      fakeRealpath(realpathMap),
      fakeReadFile(fileMap),
      () => Promise.resolve(null),
    )
    const result = await reader.read('nonexistent.png', null)
    expect(result).toBeNull()
  })

  it('revision モードで git cat-file 経由で読み取る', async () => {
    const rev = parseRevision('HEAD')
    const catFileBuf = Buffer.from('git-content')
    const reader = createRawBlobReader(
      repoRoot,
      fakeRealpath(realpathMap),
      fakeReadFile(fileMap),
      () => Promise.resolve(catFileBuf),
    )
    const result = await reader.read('file.txt', rev)
    expect(result).not.toBeNull()
    expect(result?.buffer).toEqual(catFileBuf)
  })

  it('revision モードで git cat-file が null を返すと null を返す', async () => {
    const rev = parseRevision('HEAD')
    const reader = createRawBlobReader(
      repoRoot,
      fakeRealpath(realpathMap),
      fakeReadFile(fileMap),
      () => Promise.resolve(null),
    )
    const result = await reader.read('nonexistent.txt', rev)
    expect(result).toBeNull()
  })
})
