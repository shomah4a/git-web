import { describe, expect, it } from 'vitest'
import type { Blob } from '../domain/blob.js'
import { InvalidDiffPathError, InvalidRevisionError } from '../domain/errors.js'
import type { Revision } from '../domain/revision.js'
import type { BlobService } from '../service/blob-service.js'
import { createBlobHandler } from './blob-controller.js'

type Call = { readonly path: string; readonly rev: Revision | null }

function createFakeService(
  blobByKey: Readonly<Record<string, Blob | null>>,
): BlobService & { readonly calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    getBlob(path, rev) {
      calls.push({ path, rev })
      const key = rev === null ? `${path}|WORKTREE` : `${path}|${rev.raw}`
      return Promise.resolve(blobByKey[key] ?? null)
    },
  }
}

function makeRequest(url: string): { url: string; method: 'GET' } {
  return { url, method: 'GET' }
}

const TEXT_BLOB: Blob = {
  path: 'README.md',
  rev: null,
  content: '# hi\n',
  binary: false,
  language: 'markdown',
}

const TEXT_BLOB_HEAD: Blob = {
  path: 'README.md',
  rev: { raw: 'HEAD' },
  content: '# HEAD content\n',
  binary: false,
  language: 'markdown',
}

const BINARY_BLOB: Blob = {
  path: 'image.png',
  rev: { raw: 'HEAD' },
  content: '',
  binary: true,
  language: null,
}

describe('createBlobHandler', () => {
  it('rev クエリなしは worktree の blob を返す', async () => {
    const service = createFakeService({ 'README.md|WORKTREE': TEXT_BLOB })
    const handler = createBlobHandler(service)

    const res = await handler(makeRequest('/api/blob?path=README.md'))

    expect(res.status).toBe(200)
    if (typeof res.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(res.body)
    expect(parsed).toEqual({
      path: 'README.md',
      rev: null,
      content: '# hi\n',
      binary: false,
      language: 'markdown',
    })
    expect(service.calls).toEqual([{ path: 'README.md', rev: null }])
  })

  it('rev クエリ指定で cat-file 相当の blob を返す', async () => {
    const service = createFakeService({ 'README.md|HEAD': TEXT_BLOB_HEAD })
    const handler = createBlobHandler(service)

    const res = await handler(makeRequest('/api/blob?path=README.md&rev=HEAD'))

    expect(res.status).toBe(200)
    if (typeof res.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(res.body)
    expect(parsed).toMatchObject({ rev: 'HEAD' })
  })

  it('binary は content が空文字のまま 200 で返る', async () => {
    const service = createFakeService({ 'image.png|HEAD': BINARY_BLOB })
    const handler = createBlobHandler(service)

    const res = await handler(makeRequest('/api/blob?path=image.png&rev=HEAD'))

    expect(res.status).toBe(200)
    if (typeof res.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(res.body)
    expect(parsed).toMatchObject({ binary: true, content: '' })
  })

  it('service が null を返したら 404', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    const res = await handler(makeRequest('/api/blob?path=missing.ts'))

    expect(res.status).toBe(404)
  })

  it('path クエリが無い場合は InvalidDiffPathError を投げる (error-mapper で 400)', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    await expect(handler(makeRequest('/api/blob'))).rejects.toBeInstanceOf(InvalidDiffPathError)
  })

  it('path が空文字の場合は InvalidDiffPathError を投げる', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    await expect(handler(makeRequest('/api/blob?path='))).rejects.toBeInstanceOf(
      InvalidDiffPathError,
    )
  })

  it('path に .. segment が含まれる場合は InvalidDiffPathError', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    await expect(handler(makeRequest('/api/blob?path=../etc/passwd'))).rejects.toBeInstanceOf(
      InvalidDiffPathError,
    )
  })

  it('rev クエリが不正形式 (ブランチ名) の場合は InvalidRevisionError', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    await expect(handler(makeRequest('/api/blob?path=README.md&rev=main'))).rejects.toBeInstanceOf(
      InvalidRevisionError,
    )
  })

  it('rev クエリが空文字 (rev=) の場合は InvalidRevisionError', async () => {
    const service = createFakeService({})
    const handler = createBlobHandler(service)

    await expect(handler(makeRequest('/api/blob?path=README.md&rev='))).rejects.toBeInstanceOf(
      InvalidRevisionError,
    )
  })
})
