import { describe, expect, it } from 'vitest'
import { InvalidRevisionError } from '../domain/errors.js'
import { buildReviewComment, mergeResolved, type ResolvedComment } from '../domain/review.js'
import type { ReviewListResult, ReviewService } from '../service/review-service.js'
import { createReviewListHandler } from './review-controller.js'

const SHA = 'e'.repeat(40)

function resolvedComment(id: string, resolved: boolean): ResolvedComment {
  const [c] = mergeResolved(
    [
      buildReviewComment({
        id,
        sha: SHA,
        path: 'src/foo.ts',
        newLineStart: 3,
        newLineEnd: 5,
        body: 'comment body',
        createdAt: '2026-06-17T00:00:00.000Z',
      }),
    ],
    new Map([[id, resolved]]),
  )
  if (c === undefined) {
    throw new Error('unreachable')
  }
  return c
}

function fakeService(result: ReviewListResult): ReviewService {
  return { listForRevision: () => Promise.resolve(result) }
}

describe('createReviewListHandler', () => {
  it('rev クエリ欠落時は InvalidRevisionError を投げる', async () => {
    const handler = createReviewListHandler(fakeService({ sha: SHA, comments: [] }))

    await expect(handler({ method: 'GET', url: '/api/reviews' })).rejects.toThrow(
      InvalidRevisionError,
    )
  })

  it('正常時に sha とコメント DTO を返す', async () => {
    const handler = createReviewListHandler(
      fakeService({ sha: SHA, comments: [resolvedComment('c1', true)] }),
    )

    const response = await handler({ method: 'GET', url: '/api/reviews?rev=HEAD' })

    expect(response.status).toBe(200)
    const body: unknown = JSON.parse(
      typeof response.body === 'string' ? response.body : Buffer.from(response.body).toString(),
    )
    expect(body).toEqual({
      sha: SHA,
      comments: [
        {
          id: 'c1',
          sha: SHA,
          path: 'src/foo.ts',
          newLineStart: 3,
          newLineEnd: 5,
          body: 'comment body',
          createdAt: '2026-06-17T00:00:00.000Z',
          resolved: true,
        },
      ],
    })
  })
})
