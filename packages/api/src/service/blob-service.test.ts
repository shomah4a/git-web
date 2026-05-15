import { describe, expect, it, vi } from 'vitest'
import type { Blob } from '../domain/blob.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import { createBlobService } from './blob-service.js'

function makeReader(blob: Blob | null): BlobReader {
  return { read: vi.fn(() => Promise.resolve(blob)) }
}

describe('createBlobService', () => {
  it('reader が返した Blob に path 由来の language を埋める (typescript)', async () => {
    const reader = makeReader({
      path: 'src/main.ts',
      rev: null,
      content: 'export const a = 1\n',
      binary: false,
      language: null,
    })
    const service = createBlobService()

    const result = await service.getBlob(reader, 'src/main.ts', null)

    expect(result?.language).toBe('typescript')
    expect(result?.content).toBe('export const a = 1\n')
  })

  it('path が未知拡張子の場合 language は null', async () => {
    const reader = makeReader({
      path: 'LICENSE',
      rev: null,
      content: 'text',
      binary: false,
      language: null,
    })
    const service = createBlobService()

    const result = await service.getBlob(reader, 'LICENSE', null)

    expect(result?.language).toBeNull()
  })

  it('reader が null を返したら service も null を返す', async () => {
    const reader = makeReader(null)
    const service = createBlobService()

    const result = await service.getBlob(reader, 'missing.ts', null)

    expect(result).toBeNull()
  })

  it('拡張子なしファイルで shebang から language を判定する', async () => {
    const reader = makeReader({
      path: 'script',
      rev: null,
      content: '#!/usr/bin/env python3\nimport sys\n',
      binary: false,
      language: null,
    })
    const service = createBlobService()

    const result = await service.getBlob(reader, 'script', null)

    expect(result?.language).toBe('python')
  })

  it('拡張子なしファイルで shebang がなければ language は null', async () => {
    const reader = makeReader({
      path: 'script',
      rev: null,
      content: '# just a script\necho hello\n',
      binary: false,
      language: null,
    })
    const service = createBlobService()

    const result = await service.getBlob(reader, 'script', null)

    expect(result?.language).toBeNull()
  })

  it('binary は維持したまま language のみ埋める', async () => {
    const reader = makeReader({
      path: 'image.png',
      rev: { raw: 'HEAD' },
      content: '',
      binary: true,
      language: null,
    })
    const service = createBlobService()

    const result = await service.getBlob(reader, 'image.png', { raw: 'HEAD' })

    expect(result?.binary).toBe(true)
    expect(result?.content).toBe('')
    // png は inferLanguage の対象外なので null
    expect(result?.language).toBeNull()
  })
})
