import { describe, expect, it } from 'vitest'
import type { GitRefsClient } from '../domain/ports/git-refs-client.js'
import { createRefsService } from './refs-service.js'

function createFakeGit(
  branches: ReadonlyArray<string>,
  tags: ReadonlyArray<string>,
): GitRefsClient {
  return {
    listBranches: () => Promise.resolve(branches),
    listTags: () => Promise.resolve(tags),
  }
}

describe('RefsService.list', () => {
  it('q_空文字列ではすべてのブランチとタグを返す', async () => {
    const service = createRefsService(createFakeGit(['main', 'feature/a'], ['v1.0.0']))
    const result = await service.list({ q: '' })

    expect(result.defaultBranch).toBe('main')
    expect(result.branches).toEqual(['main', 'feature/a'])
    expect(result.tags).toEqual(['v1.0.0'])
  })

  it('q_によるブランチ・タグの大小区別なし部分一致フィルタが効く', async () => {
    const service = createRefsService(
      createFakeGit(['main', 'feature/FOO', 'feature/bar', 'release-1.0'], ['v1.0.0', 'v0.9.0']),
    )
    const result = await service.list({ q: 'foo' })

    expect(result.branches).toEqual(['feature/FOO'])
    expect(result.tags).toEqual([])
  })

  it('件数制限なしで全ブランチ・全タグを返す', async () => {
    const service = createRefsService(createFakeGit(['b1', 'b2', 'b3'], ['t1', 't2']))
    const result = await service.list({ q: '' })

    expect(result.branches).toEqual(['b1', 'b2', 'b3'])
    expect(result.tags).toEqual(['t1', 't2'])
  })

  it('defaultBranch_は_main_を優先して返す', async () => {
    const service = createRefsService(createFakeGit(['master', 'main'], []))
    const result = await service.list({ q: '' })

    expect(result.defaultBranch).toBe('main')
  })

  it('main_がなければ_master_を_defaultBranch_として返す', async () => {
    const service = createRefsService(createFakeGit(['master', 'develop'], []))
    const result = await service.list({ q: '' })

    expect(result.defaultBranch).toBe('master')
  })

  it('main_も_master_もなければ_defaultBranch_は_null', async () => {
    const service = createRefsService(createFakeGit(['develop', 'feature/a'], []))
    const result = await service.list({ q: '' })

    expect(result.defaultBranch).toBeNull()
  })

  it('defaultBranch_はフィルタ前の全件から判定する', async () => {
    const service = createRefsService(createFakeGit(['alpha', 'beta', 'main'], []))
    // q='alpha' でフィルタしても defaultBranch は全件から判定
    const result = await service.list({ q: 'alpha' })

    expect(result.defaultBranch).toBe('main')
    expect(result.branches).toEqual(['alpha'])
  })
})
