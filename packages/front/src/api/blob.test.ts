import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBlob } from './blob.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const VALID_BLOB = {
  path: 'src/foo.ts',
  rev: null,
  content: 'const a = 1\n',
  binary: false,
  language: 'typescript',
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function mockFetch(responses: ReadonlyArray<Response>): Array<string> {
  const calls: string[] = []
  let idx = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      calls.push(urlOf(input))
      const response = responses[idx]
      idx++
      if (response === undefined) {
        return Promise.reject(new Error('no more mocked response'))
      }
      return Promise.resolve(response)
    }),
  )
  return calls
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchBlob', () => {
  it('rev が null のときは rev クエリを付けず path のみを URLSearchParams で乗せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_BLOB)])

    await fetchBlob('src/foo.ts', null)

    // "/" は URLSearchParams で "%2F" にエンコードされる
    expect(calls[0]).toBe('/api/blob?path=src%2Ffoo.ts')
  })

  it('rev が文字列のときは rev クエリを付ける', async () => {
    const calls = mockFetch([jsonResponse(200, { ...VALID_BLOB, rev: 'HEAD' })])

    await fetchBlob('src/foo.ts', 'HEAD')

    expect(calls[0]).toBe('/api/blob?path=src%2Ffoo.ts&rev=HEAD')
  })

  it('200 の場合は BlobDto を返す', async () => {
    mockFetch([jsonResponse(200, VALID_BLOB)])

    const result = await fetchBlob('src/foo.ts', null)

    expect(result).not.toBeNull()
    expect(result?.path).toBe('src/foo.ts')
    expect(result?.content).toBe('const a = 1\n')
    expect(result?.binary).toBe(false)
    expect(result?.language).toBe('typescript')
  })

  it('404 の場合は null を返す', async () => {
    mockFetch([new Response('not found', { status: 404 })])

    const result = await fetchBlob('missing.ts', null)

    expect(result).toBeNull()
  })

  it('500 などの場合は例外を投げる', async () => {
    mockFetch([new Response('boom', { status: 500 })])

    await expect(fetchBlob('src/foo.ts', null)).rejects.toThrow('HTTP 500')
  })

  it('ボディのフィールドが欠けていると例外を投げる', async () => {
    mockFetch([jsonResponse(200, { path: 'foo.ts' })])

    await expect(fetchBlob('foo.ts', null)).rejects.toThrow('unexpected body shape')
  })

  it('binary フィールドが boolean でないと例外を投げる', async () => {
    mockFetch([jsonResponse(200, { ...VALID_BLOB, binary: 'yes' })])

    await expect(fetchBlob('foo.ts', null)).rejects.toThrow('unexpected body shape')
  })
})
