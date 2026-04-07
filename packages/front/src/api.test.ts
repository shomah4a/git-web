import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRepoInfo } from './api.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRepoInfo', () => {
  it('200OKかつ正しい形のJSONを返すとRepoInfoを返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cwd: '/tmp/repo', head: 'abc1234' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    const result = await fetchRepoInfo()

    expect(result).toEqual({ cwd: '/tmp/repo', head: 'abc1234' })
  })

  it('ステータスが200以外の場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('HTTP 500')
  })

  it('レスポンスにcwdが欠けている場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ head: 'abc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('unexpected body shape')
  })

  it('レスポンスのheadが文字列でない場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cwd: '/tmp', head: 42 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('unexpected body shape')
  })
})
