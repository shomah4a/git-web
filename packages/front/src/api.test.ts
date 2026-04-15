import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRepoInfo } from './api.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRepoInfo', () => {
  it('200OKかつ正しい形のJSONを返すとRepoInfoDtoを返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              name: 'repo',
              cwd: '/tmp/repo',
              head: { commitHash: 'abc1234', branch: 'main' },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        ),
      ),
    )

    const result = await fetchRepoInfo()

    expect(result).toEqual({
      name: 'repo',
      cwd: '/tmp/repo',
      head: { commitHash: 'abc1234', branch: 'main' },
    })
  })

  it('ステータスが200以外の場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('HTTP 500')
  })

  it('レスポンスにnameが欠けている場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cwd: '/tmp', head: { commitHash: 'abc', branch: null } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('unexpected body shape')
  })

  it('レスポンスにcwdが欠けている場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ head: { commitHash: 'abc', branch: null } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('unexpected body shape')
  })

  it('レスポンスのheadがオブジェクトでない場合は例外を投げる', async () => {
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

  it('レスポンスのhead.commitHashが欠けている場合は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cwd: '/tmp', head: { branch: 'main' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    await expect(fetchRepoInfo()).rejects.toThrow('unexpected body shape')
  })
})
