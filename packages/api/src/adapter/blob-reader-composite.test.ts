import { describe, expect, it, vi } from 'vitest'
import type { Blob } from '../domain/blob.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { Revision } from '../domain/revision.js'
import { createCompositeBlobReader } from './blob-reader-composite.js'

function makeFakeReader(name: string): { reader: BlobReader; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(
    (path: string, rev: Revision | null): Promise<Blob | null> =>
      Promise.resolve({
        path,
        rev,
        content: name,
        binary: false,
        language: null,
      }),
  )
  return {
    reader: { read: spy },
    spy,
  }
}

describe('createCompositeBlobReader', () => {
  it('rev === null の場合は worktree に委譲する', async () => {
    const worktree = makeFakeReader('from-worktree')
    const catFile = makeFakeReader('from-catfile')
    const composite = createCompositeBlobReader(worktree.reader, catFile.reader)

    const result = await composite.read('a.ts', null)

    expect(result?.content).toBe('from-worktree')
    expect(worktree.spy).toHaveBeenCalledTimes(1)
    expect(catFile.spy).not.toHaveBeenCalled()
  })

  it('rev !== null の場合は cat-file に委譲する', async () => {
    const worktree = makeFakeReader('from-worktree')
    const catFile = makeFakeReader('from-catfile')
    const composite = createCompositeBlobReader(worktree.reader, catFile.reader)

    const result = await composite.read('a.ts', { raw: 'HEAD' })

    expect(result?.content).toBe('from-catfile')
    expect(catFile.spy).toHaveBeenCalledTimes(1)
    expect(worktree.spy).not.toHaveBeenCalled()
  })
})
