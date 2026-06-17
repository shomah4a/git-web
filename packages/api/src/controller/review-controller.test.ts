import { describe, expect, it } from 'vitest'
import { InvalidReviewCommentError, InvalidRevisionError } from '../domain/errors.js'
import { buildReviewComment, mergeResolved, type ResolvedComment } from '../domain/review.js'
import type { AddCommentInput, ReviewService, SetResolvedInput } from '../service/review-service.js'
import {
  createReviewCreateHandler,
  createReviewListHandler,
  createReviewResolveHandler,
} from './review-controller.js'

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

/** 全メソッドを持つ手書き fake。既定はテストで上書きする。 */
function fakeService(overrides: Partial<ReviewService> = {}): ReviewService {
  return {
    listForRevision: () => Promise.resolve({ sha: SHA, comments: [] }),
    addComment: () => Promise.reject(new Error('addComment not stubbed')),
    setResolved: () => Promise.resolve(),
    ...overrides,
  }
}

function parseBody(body: string | Uint8Array): unknown {
  return JSON.parse(typeof body === 'string' ? body : Buffer.from(body).toString())
}

describe('createReviewListHandler', () => {
  it('rev クエリ欠落時は InvalidRevisionError を投げる', async () => {
    const handler = createReviewListHandler(fakeService())
    await expect(handler({ method: 'GET', url: '/api/reviews' })).rejects.toThrow(
      InvalidRevisionError,
    )
  })

  it('正常時に sha とコメント DTO を返す', async () => {
    const handler = createReviewListHandler(
      fakeService({
        listForRevision: () =>
          Promise.resolve({ sha: SHA, comments: [resolvedComment('c1', true)] }),
      }),
    )

    const response = await handler({ method: 'GET', url: '/api/reviews?rev=HEAD' })

    expect(response.status).toBe(200)
    expect(parseBody(response.body)).toEqual({
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

describe('createReviewCreateHandler', () => {
  it('body が空のとき InvalidReviewCommentError を投げる', async () => {
    const handler = createReviewCreateHandler(fakeService())
    await expect(handler({ method: 'POST', url: '/api/reviews' })).rejects.toThrow(
      InvalidReviewCommentError,
    )
  })

  it('不正な JSON body は InvalidReviewCommentError を投げる', async () => {
    const handler = createReviewCreateHandler(fakeService())
    await expect(
      handler({ method: 'POST', url: '/api/reviews', body: 'not json' }),
    ).rejects.toThrow(InvalidReviewCommentError)
  })

  it('必須フィールド欠落は InvalidReviewCommentError を投げる', async () => {
    const handler = createReviewCreateHandler(fakeService())
    await expect(
      handler({ method: 'POST', url: '/api/reviews', body: JSON.stringify({ sha: SHA }) }),
    ).rejects.toThrow(InvalidReviewCommentError)
  })

  it('正常な body で service.addComment を呼び 201 と DTO を返す', async () => {
    const received: AddCommentInput[] = []
    const handler = createReviewCreateHandler(
      fakeService({
        addComment: (input) => {
          received.push(input)
          return Promise.resolve(resolvedComment('new-id', false))
        },
      }),
    )

    const response = await handler({
      method: 'POST',
      url: '/api/reviews',
      body: JSON.stringify({
        sha: SHA,
        path: 'src/foo.ts',
        newLineStart: 3,
        newLineEnd: 5,
        body: 'comment body',
      }),
    })

    expect(response.status).toBe(201)
    expect(received[0]?.sha).toBe(SHA)
    expect(received[0]?.newLineStart).toBe(3)
  })
})

describe('createReviewResolveHandler', () => {
  it('正常な body で service.setResolved を呼び 200 を返す', async () => {
    const received: SetResolvedInput[] = []
    const handler = createReviewResolveHandler(
      fakeService({
        setResolved: (input) => {
          received.push(input)
          return Promise.resolve()
        },
      }),
    )

    const response = await handler({
      method: 'POST',
      url: '/api/reviews/resolve',
      body: JSON.stringify({ sha: SHA, id: 'c1', resolved: true }),
    })

    expect(response.status).toBe(200)
    expect(received[0]).toEqual({ sha: SHA, id: 'c1', resolved: true })
  })

  it('resolved が boolean でないと InvalidReviewCommentError を投げる', async () => {
    const handler = createReviewResolveHandler(fakeService())
    await expect(
      handler({
        method: 'POST',
        url: '/api/reviews/resolve',
        body: JSON.stringify({ sha: SHA, id: 'c1', resolved: 'yes' }),
      }),
    ).rejects.toThrow(InvalidReviewCommentError)
  })
})
