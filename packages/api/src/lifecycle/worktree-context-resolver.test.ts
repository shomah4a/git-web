import { describe, expect, it } from 'vitest'
import type { WorktreeListItem, WorktreesListService } from '../service/worktrees-list-service.js'
import { createWorktreeContextResolver } from './worktree-context-resolver.js'

function fakeService(snapshots: ReadonlyArray<ReadonlyArray<WorktreeListItem>>): {
  service: WorktreesListService
  calls: { count: number }
} {
  const calls = { count: 0 }
  return {
    calls,
    service: {
      listWorktrees: () => {
        const i = Math.min(calls.count, snapshots.length - 1)
        calls.count++
        return Promise.resolve(snapshots[i] ?? [])
      },
    },
  }
}

function item(overrides: Partial<WorktreeListItem>): WorktreeListItem {
  return {
    name: 'repo',
    path: '/tmp/repo',
    headHash: '1111111111111111111111111111111111111111',
    branchRef: 'refs/heads/main',
    isDetached: false,
    isDefault: true,
    isMain: true,
    ...overrides,
  }
}

describe('WorktreeContextResolver.resolve', () => {
  it('default worktree を null 指定で解決する', async () => {
    const { service } = fakeService([[item({ path: '/tmp/repo' })]])
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/repo',
      now: () => 0,
    })

    const ctx = await resolver.resolve(null)
    expect(ctx?.name).toBe('repo')
    expect(ctx?.path.absolutePath).toBe('/tmp/repo')
    expect(ctx?.isDefault).toBe(true)
  })

  it('既知 name を解決する', async () => {
    const { service } = fakeService([
      [
        item({ name: 'main-r', path: '/tmp/main-r', isDefault: true }),
        item({
          name: 'feat',
          path: '/tmp/feat',
          isDefault: false,
          isMain: false,
          branchRef: 'refs/heads/feat',
        }),
      ],
    ])
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/main-r',
      now: () => 0,
    })

    const ctx = await resolver.resolve('feat')
    expect(ctx?.name).toBe('feat')
    expect(ctx?.path.absolutePath).toBe('/tmp/feat')
    expect(ctx?.isDefault).toBe(false)
  })

  it('未知 name は再フェッチして見つかれば返す', async () => {
    const { service, calls } = fakeService([
      [item({ name: 'main-r', path: '/tmp/main-r', isDefault: true })],
      [
        item({ name: 'main-r', path: '/tmp/main-r', isDefault: true }),
        item({ name: 'added', path: '/tmp/added', isDefault: false, isMain: false }),
      ],
    ])
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/main-r',
      now: () => 0,
    })

    // 1 回目: name=added は無いが、resolver が invalidate して再フェッチする
    const ctx = await resolver.resolve('added')
    expect(ctx?.name).toBe('added')
    expect(calls.count).toBe(2)
  })

  it('未知 name は再フェッチしても見つからなければ null', async () => {
    const { service } = fakeService([
      [item({ name: 'main-r', path: '/tmp/main-r', isDefault: true })],
    ])
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/main-r',
      now: () => 0,
    })

    const ctx = await resolver.resolve('nope')
    expect(ctx).toBeNull()
  })

  it('TTL 内は再フェッチしない', async () => {
    const { service, calls } = fakeService([
      [item({ name: 'main-r', path: '/tmp/main-r', isDefault: true })],
    ])
    let nowValue = 0
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/main-r',
      now: () => nowValue,
      ttlMs: 1000,
    })

    await resolver.resolve(null)
    nowValue = 999
    await resolver.resolve(null)
    expect(calls.count).toBe(1)
  })

  it('TTL 経過後は再フェッチする', async () => {
    const { service, calls } = fakeService([
      [item({ name: 'main-r', path: '/tmp/main-r', isDefault: true })],
      [item({ name: 'main-r', path: '/tmp/main-r', isDefault: true })],
    ])
    let nowValue = 0
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/main-r',
      now: () => nowValue,
      ttlMs: 1000,
    })

    await resolver.resolve(null)
    nowValue = 1500
    await resolver.resolve(null)
    expect(calls.count).toBe(2)
  })

  it('getDefault は default が無いとき throw する', async () => {
    const { service } = fakeService([
      [item({ name: 'other', path: '/tmp/other', isDefault: false, isMain: false })],
    ])
    const resolver = createWorktreeContextResolver({
      service,
      defaultWorktreePath: '/tmp/missing',
      now: () => 0,
    })

    await expect(resolver.getDefault()).rejects.toThrow(/default worktree/)
  })
})
