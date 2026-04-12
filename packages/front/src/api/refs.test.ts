import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRefs } from './refs.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const VALID_REFS = {
  defaultBranch: 'main',
  branches: ['main', 'feature/foo'],
  tags: ['v1.0.0'],
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
  it('クエリ_q_を_URL_に載せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('feat')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('/api/refs?q=feat')
  })

  it('空文字の_q_も載せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('')
    expect(calls[0]).toBe('/api/refs?q=')
  })

  it('特殊文字を含む_q_はエンコードされる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_REFS)])
    await fetchRefs('a b/c')
    expect(calls[0]).toBe('/api/refs?q=a+b%2Fc')
  })

  it('正常レスポンスを_RefListDto_として返す', async () => {
    mockFetch([jsonResponse(200, VALID_REFS)])
    const result = await fetchRefs('')
    expect(result.defaultBranch).toBe('main')
    expect(result.branches).toEqual(['main', 'feature/foo'])
    expect(result.tags).toEqual(['v1.0.0'])
  })

  it('defaultBranch_が_null_でも受理する', async () => {
    mockFetch([
      jsonResponse(200, {
        defaultBranch: null,
        branches: [],
        tags: [],
      }),
    ])
    const result = await fetchRefs('')
    expect(result.defaultBranch).toBe(null)
  })

  it('4xx_は_throw_する', async () => {
    mockFetch([jsonResponse(400, { error: 'invalid_refs_query' })])
    await expect(fetchRefs('')).rejects.toThrow('/api/refs returned HTTP 400')
  })

  it('5xx_は_throw_する', async () => {
    mockFetch([jsonResponse(500, { error: 'internal' })])
    await expect(fetchRefs('')).rejects.toThrow('/api/refs returned HTTP 500')
  })

  it('defaultBranch_フィールド欠損は_throw_する', async () => {
    mockFetch([jsonResponse(200, { branches: [], tags: [] })])
    await expect(fetchRefs('')).rejects.toThrow('unexpected body shape')
  })

  it('defaultBranch_が文字列でも_null_でもない場合は_throw_する', async () => {
    mockFetch([
      jsonResponse(200, {
        defaultBranch: 123,
        branches: [],
        tags: [],
      }),
    ])
    await expect(fetchRefs('')).rejects.toThrow('unexpected body shape')
  })

  it('branches_フィールド欠損は_throw_する', async () => {
    mockFetch([jsonResponse(200, { defaultBranch: null, tags: [] })])
    await expect(fetchRefs('')).rejects.toThrow('unexpected body shape')
  })

  it('branches_に数値混入は_throw_する', async () => {
    mockFetch([
      jsonResponse(200, {
        defaultBranch: null,
        branches: ['a', 1],
        tags: [],
      }),
    ])
    await expect(fetchRefs('')).rejects.toThrow('unexpected body shape')
  })
})
