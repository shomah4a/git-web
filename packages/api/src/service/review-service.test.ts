import { describe, expect, it } from 'vitest'
import type { GitShaResolver } from '../domain/ports/git-sha-resolver.js'
import type { ReviewStore } from '../domain/ports/review-store.js'
import {
  buildReviewComment,
  type ResolvedEvent,
  type ReviewComment,
  type ReviewSha,
} from '../domain/review.js'
import { parseRevision } from '../domain/revision.js'
import { createReviewService } from './review-service.js'

const SHA = 'd'.repeat(40)

function fakeResolver(resolved: string): GitShaResolver {
  return { resolveCommitSha: () => Promise.resolve(resolved) }
}

function fakeStore(params: {
  comments?: ReadonlyArray<ReviewComment>
  events?: ReadonlyArray<ResolvedEvent>
}): ReviewStore {
  return {
    listComments: () => Promise.resolve(params.comments ?? []),
    listResolvedEvents: () => Promise.resolve(params.events ?? []),
    appendComment: () => Promise.resolve(),
    appendResolvedEvent: () => Promise.resolve(),
  }
}

function comment(id: string): ReviewComment {
  return buildReviewComment({
    id,
    sha: SHA,
    path: 'src/foo.ts',
    newLineStart: 1,
    newLineEnd: 1,
    body: 'b',
    createdAt: '2026-06-17T00:00:00.000Z',
  })
}

describe('createReviewService.listForRevision', () => {
  it('rev を解決した 40 桁 SHA を返す', async () => {
    const service = createReviewService({
      store: fakeStore({}),
      shaResolver: fakeResolver(SHA),
    })

    const result = await service.listForRevision(parseRevision('HEAD'))

    expect(result.sha).toBe(SHA)
  })

  it('store のコメントに resolved 状態を合成して返す', async () => {
    const events: ResolvedEvent[] = [{ id: 'c1', resolved: true, ts: '2026-06-17T00:00:00.000Z' }]
    const service = createReviewService({
      store: fakeStore({ comments: [comment('c1'), comment('c2')], events }),
      shaResolver: fakeResolver(SHA),
    })

    const result = await service.listForRevision(parseRevision('HEAD'))

    expect(result.comments.find((c) => c.id === 'c1')?.resolved).toBe(true)
    expect(result.comments.find((c) => c.id === 'c2')?.resolved).toBe(false)
  })

  it('解決後の SHA が 40 桁でなければ例外を投げる', async () => {
    const service = createReviewService({
      store: fakeStore({}),
      shaResolver: fakeResolver('not-a-sha'),
    })

    await expect(service.listForRevision(parseRevision('HEAD'))).rejects.toThrow()
  })

  it('listComments には解決済み SHA が渡る', async () => {
    const seen: ReviewSha[] = []
    const store: ReviewStore = {
      listComments: (sha) => {
        seen.push(sha)
        return Promise.resolve([])
      },
      listResolvedEvents: () => Promise.resolve([]),
      appendComment: () => Promise.resolve(),
      appendResolvedEvent: () => Promise.resolve(),
    }
    const service = createReviewService({ store, shaResolver: fakeResolver(SHA) })

    await service.listForRevision(parseRevision('main'))

    expect(seen[0]?.value).toBe(SHA)
  })
})
