import { describe, expect, it } from 'vitest'
import type { GitRefsClient } from '../domain/ports/git-refs-client.js'
import { createRefsService } from './refs-service.js'

function createFakeGit(
  head: string | null,
  branches: ReadonlyArray<string>,
  tags: ReadonlyArray<string>,
): GitRefsClient {
  return {
    headRef: () => Promise.resolve(head),
    listBranches: () => Promise.resolve(branches),
    listTags: () => Promise.resolve(tags),
  }
}

describe('RefsService.list', () => {
  it('q 空文字列ではすべてのブランチとタグを返す', async () => {
    const service = createRefsService(createFakeGit('main', ['main', 'feature/a'], ['v1.0.0']))
    const result = await service.list({ q: '', limit: 100 })

    expect(result.head).toBe('main')
    expect(result.branches).toEqual(['main', 'feature/a'])
    expect(result.tags).toEqual(['v1.0.0'])
    expect(result.truncated).toBe(false)
  })

  it('q によるブランチ・タグの大小区別なし部分一致フィルタが効く', async () => {
    const service = createRefsService(
      createFakeGit(
        'main',
        ['main', 'feature/FOO', 'feature/bar', 'release-1.0'],
        ['v1.0.0', 'v0.9.0'],
      ),
    )
    const result = await service.list({ q: 'foo', limit: 100 })

    expect(result.branches).toEqual(['feature/FOO'])
    expect(result.tags).toEqual([])
  })

  it('head は q フィルタの対象外 (常に実体を返す)', async () => {
    const service = createRefsService(createFakeGit('main', ['main'], []))
    const result = await service.list({ q: 'xyz', limit: 100 })

    expect(result.head).toBe('main')
  })

  it('合計件数が limit を超えたら ブランチ優先で切り詰め truncated=true', async () => {
    const service = createRefsService(createFakeGit('main', ['b1', 'b2', 'b3'], ['t1', 't2']))
    const result = await service.list({ q: '', limit: 4 })

    expect(result.branches).toEqual(['b1', 'b2', 'b3'])
    expect(result.tags).toEqual(['t1'])
    expect(result.truncated).toBe(true)
  })

  it('ブランチだけで limit を使い切った場合はタグが空 truncated=true', async () => {
    const service = createRefsService(createFakeGit('main', ['b1', 'b2', 'b3', 'b4', 'b5'], ['t1']))
    const result = await service.list({ q: '', limit: 3 })

    expect(result.branches).toEqual(['b1', 'b2', 'b3'])
    expect(result.tags).toEqual([])
    expect(result.truncated).toBe(true)
  })

  it('フィルタ後の合計が limit 以下なら truncated=false', async () => {
    const service = createRefsService(createFakeGit('main', ['main', 'feature'], ['v1']))
    const result = await service.list({ q: '', limit: 100 })

    expect(result.truncated).toBe(false)
  })

  it('head が null (detached / unborn) でもそのまま返す', async () => {
    const service = createRefsService(createFakeGit(null, ['main'], []))
    const result = await service.list({ q: '', limit: 100 })

    expect(result.head).toBeNull()
    expect(result.branches).toEqual(['main'])
  })
})
