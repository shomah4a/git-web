import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTreeCommits } from './tree-commits.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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

const VALID_ENTRY = {
  name: 'README.md',
  lastCommit: { hash: 'abcdef0', date: 1745193600, subject: 'first' },
}

describe('fetchTreeCommits', () => {
  it('rev=null かつ path=空 のときはクエリなし', async () => {
    const calls = mockFetch([jsonResponse(200, { entries: [VALID_ENTRY] })])

    await fetchTreeCommits(null, '')

    expect(calls[0]).toBe('/api/tree-commits')
  })

  it('rev/path 指定時は両方クエリに乗る', async () => {
    const calls = mockFetch([jsonResponse(200, { entries: [] })])

    await fetchTreeCommits('HEAD', 'src')

    expect(calls[0]).toBe('/api/tree-commits?rev=HEAD&path=src')
  })

  it('lastCommit=null のエントリを許容する', async () => {
    mockFetch([jsonResponse(200, { entries: [{ name: 'untracked.ts', lastCommit: null }] })])

    const result = await fetchTreeCommits(null, '')

    expect(result).toEqual([{ name: 'untracked.ts', lastCommit: null }])
  })

  it('200 で有効なボディなら entries を返す', async () => {
    mockFetch([jsonResponse(200, { entries: [VALID_ENTRY] })])

    const result = await fetchTreeCommits('HEAD', '')

    expect(result).toEqual([VALID_ENTRY])
  })

  it('500 などのエラーは例外を投げる', async () => {
    mockFetch([new Response('boom', { status: 500 })])

    await expect(fetchTreeCommits(null, '')).rejects.toThrow('HTTP 500')
  })

  it('lastCommit が型不正なら例外を投げる', async () => {
    mockFetch([
      jsonResponse(200, {
        entries: [{ name: 'foo', lastCommit: { hash: 'x', date: 'not-a-number', subject: 's' } }],
      }),
    ])

    await expect(fetchTreeCommits(null, '')).rejects.toThrow('unexpected body shape')
  })

  it('entries が配列でないと例外を投げる', async () => {
    mockFetch([jsonResponse(200, { entries: 'oops' })])

    await expect(fetchTreeCommits(null, '')).rejects.toThrow('unexpected body shape')
  })
})
