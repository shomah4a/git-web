import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRefs } from './refs.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const VALID_REFS = {
  head: 'main',
  branches: ['main', 'feature/foo'],
  tags: ['v1.0.0'],
  truncated: false,
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

describe('fetchRefs', () => {
  it('クエリq_とlimitを_URL_に載せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('feat', 50)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('/api/refs?q=feat&limit=50')
  })

  it('空文字のqも載せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('', 100)
    expect(calls[0]).toBe('/api/refs?q=&limit=100')
  })

  it('特殊文字を含むq_はエンコードされる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('a b/c', 10)
    expect(calls[0]).toBe('/api/refs?q=a+b%2Fc&limit=10')
  })

  it('正常レスポンスを_RefListDto_として返す', async () => {
    mockFetch([jsonResponse(200, VALID_REFS)])
    const result = await fetchRefs('', 100)
    expect(result.head).toBe('main')
    expect(result.branches).toEqual(['main', 'feature/foo'])
    expect(result.tags).toEqual(['v1.0.0'])
    expect(result.truncated).toBe(false)
  })

  it('head_が_null_でも受理する', async () => {
    mockFetch([jsonResponse(200, { head: null, branches: [], tags: [], truncated: false })])
    const result = await fetchRefs('', 100)
    expect(result.head).toBe(null)
  })

  it('4xx_は_throw_する', async () => {
    mockFetch([jsonResponse(400, { error: 'invalid_refs_query' })])
    await expect(fetchRefs('', 100)).rejects.toThrow('/api/refs returned HTTP 400')
  })

  it('5xx_は_throw_する', async () => {
    mockFetch([jsonResponse(500, { error: 'internal' })])
    await expect(fetchRefs('', 100)).rejects.toThrow('/api/refs returned HTTP 500')
  })

  it('型不正なレスポンスは_throw_する', async () => {
    mockFetch([jsonResponse(200, { head: 123, branches: [], tags: [], truncated: false })])
    await expect(fetchRefs('', 100)).rejects.toThrow('unexpected body shape')
  })

  it('branches_フィールド欠損は_throw_する', async () => {
    mockFetch([jsonResponse(200, { head: null, tags: [], truncated: false })])
    await expect(fetchRefs('', 100)).rejects.toThrow('unexpected body shape')
  })

  it('branches_に数値混入は_throw_する', async () => {
    mockFetch([jsonResponse(200, { head: null, branches: ['a', 1], tags: [], truncated: false })])
    await expect(fetchRefs('', 100)).rejects.toThrow('unexpected body shape')
  })
})
