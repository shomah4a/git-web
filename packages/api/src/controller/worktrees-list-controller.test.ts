import type { WorktreesListResponseDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import type { WorktreeListItem, WorktreesListService } from '../service/worktrees-list-service.js'
import { createWorktreesListHandler } from './worktrees-list-controller.js'

function fakeService(items: ReadonlyArray<WorktreeListItem>): WorktreesListService {
  return { listWorktrees: () => Promise.resolve(items) }
}

function makeRequest(): { url: string; method: 'GET' } {
  return { url: '/api/worktrees', method: 'GET' }
}

function parseBody(body: string | Uint8Array): WorktreesListResponseDto {
  if (typeof body !== 'string') {
    throw new Error('expected string body')
  }
  const parsed: unknown = JSON.parse(body)
  if (!isWorktreesListResponseDto(parsed)) {
    throw new Error('unexpected response shape')
  }
  return parsed
}

function isWorktreesListResponseDto(value: unknown): value is WorktreesListResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('items' in value) || !Array.isArray(value.items)) return false
  return true
}

describe('createWorktreesListHandler', () => {
  it('空配列でも 200 を返す', async () => {
    const handler = createWorktreesListHandler(fakeService([]))
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    expect(parseBody(res.body)).toEqual({ items: [] })
  })

  it('refs/heads/ プレフィックスを除去した branch を返す', async () => {
    const handler = createWorktreesListHandler(
      fakeService([
        {
          name: 'main-repo',
          path: '/tmp/repo',
          headHash: '1111111111111111111111111111111111111111',
          branchRef: 'refs/heads/main',
          isDetached: false,
          isDefault: true,
          isMain: true,
        },
      ]),
    )

    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    expect(parseBody(res.body).items).toEqual([
      {
        name: 'main-repo',
        path: '/tmp/repo',
        headHash: '1111111111111111111111111111111111111111',
        branch: 'main',
        isDetached: false,
        isDefault: true,
        isMain: true,
      },
    ])
  })

  it('detached HEAD は branch=null で返す', async () => {
    const handler = createWorktreesListHandler(
      fakeService([
        {
          name: 'inspect',
          path: '/tmp/repo/.worktrees/inspect',
          headHash: '2222222222222222222222222222222222222222',
          branchRef: null,
          isDetached: true,
          isDefault: false,
          isMain: false,
        },
      ]),
    )

    const res = await handler(makeRequest())
    const items = parseBody(res.body).items
    expect(items[0]?.branch).toBeNull()
    expect(items[0]?.isDetached).toBe(true)
  })

  it('headHash が null (空リポ) でも DTO として保持される', async () => {
    const handler = createWorktreesListHandler(
      fakeService([
        {
          name: 'empty',
          path: '/tmp/empty',
          headHash: null,
          branchRef: null,
          isDetached: false,
          isDefault: false,
          isMain: false,
        },
      ]),
    )

    const res = await handler(makeRequest())
    expect(parseBody(res.body).items[0]?.headHash).toBeNull()
  })
})
