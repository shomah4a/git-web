import { describe, expect, it } from 'vitest'
import { InvalidDiffPathError } from '../../domain/errors.js'
import { type Dirent, type FsLike, createWorktreeTreeReader } from './worktree-tree-reader.js'

function fakeDirent(name: string, kind: 'file' | 'dir'): Dirent {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
  }
}

function createFakeFs(entries: Record<string, ReadonlyArray<Dirent>>): FsLike {
  return {
    realpath: (p: string) => Promise.resolve(p),
    readdir: (p: string) => {
      const result = entries[p]
      if (result === undefined) {
        const err = new Error(`ENOENT: no such file or directory: ${p}`)
        Object.assign(err, { code: 'ENOENT' })
        return Promise.reject(err)
      }
      return Promise.resolve(result)
    },
  }
}

describe('createWorktreeTreeReader', () => {
  const repoRoot = '/repo'

  it('ルートディレクトリのエントリを返す', async () => {
    const fs = createFakeFs({
      '/repo': [fakeDirent('src', 'dir'), fakeDirent('package.json', 'file')],
    })
    const reader = createWorktreeTreeReader(repoRoot, fs)

    const result = await reader.list('')
    expect(result).toEqual([
      { name: 'src', path: 'src', type: 'tree' },
      { name: 'package.json', path: 'package.json', type: 'blob' },
    ])
  })

  it('サブディレクトリのエントリを返す', async () => {
    const fs = createFakeFs({
      '/repo/src': [fakeDirent('main.ts', 'file'), fakeDirent('components', 'dir')],
    })
    const reader = createWorktreeTreeReader(repoRoot, fs)

    const result = await reader.list('src')
    expect(result).toEqual([
      { name: 'main.ts', path: 'src/main.ts', type: 'blob' },
      { name: 'components', path: 'src/components', type: 'tree' },
    ])
  })

  it('.git ディレクトリは除外される', async () => {
    const fs = createFakeFs({
      '/repo': [fakeDirent('.git', 'dir'), fakeDirent('README.md', 'file')],
    })
    const reader = createWorktreeTreeReader(repoRoot, fs)

    const result = await reader.list('')
    expect(result).toEqual([{ name: 'README.md', path: 'README.md', type: 'blob' }])
  })

  it('存在しないディレクトリは空配列を返す', async () => {
    const fs = createFakeFs({})
    const reader = createWorktreeTreeReader(repoRoot, fs)

    const result = await reader.list('nonexistent')
    expect(result).toEqual([])
  })

  it('パストラバーサルは InvalidDiffPathError で拒否される', async () => {
    const fs = createFakeFs({})
    const reader = createWorktreeTreeReader(repoRoot, fs)

    await expect(reader.list('../etc')).rejects.toThrow(InvalidDiffPathError)
  })

  it('リポジトリ外に解決されるパスは拒否される', async () => {
    const fs: FsLike = {
      realpath: (p: string) => {
        if (p === '/repo') return Promise.resolve('/repo')
        if (p === '/repo/escape') return Promise.resolve('/outside')
        return Promise.resolve(p)
      },
      readdir: () => Promise.resolve([]),
    }
    const reader = createWorktreeTreeReader(repoRoot, fs)

    await expect(reader.list('escape')).rejects.toThrow(InvalidDiffPathError)
  })
})
