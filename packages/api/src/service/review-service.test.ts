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
const FIXED_NOW = new Date('2026-06-17T12:00:00.000Z')

function fakeResolver(params: {
  resolved?: string
  resolveError?: boolean
  rangeShas?: ReadonlyArray<string>
}): GitShaResolver {
  return {
    resolveCommitSha: () =>
      params.resolveError === true
        ? Promise.reject(new Error('unknown revision'))
        : Promise.resolve(params.resolved ?? SHA),
    revListRange: () => Promise.resolve(params.rangeShas ?? []),
  }
}

/** 呼び出しを記録できる手書き fake store (mock ライブラリ不使用)。 */
function recordingStore(params: {
  comments?: ReadonlyArray<ReviewComment>
  events?: ReadonlyArray<ResolvedEvent>
  shasWithComments?: ReadonlyArray<string>
}): {
  store: ReviewStore
  appendedComments: ReviewComment[]
  appendedEvents: Array<{ sha: ReviewSha; event: ResolvedEvent }>
  listedShas: ReviewSha[]
} {
  const appendedComments: ReviewComment[] = []
  const appendedEvents: Array<{ sha: ReviewSha; event: ResolvedEvent }> = []
  const listedShas: ReviewSha[] = []
  const store: ReviewStore = {
    listComments: (sha) => {
      listedShas.push(sha)
      return Promise.resolve(params.comments ?? [])
    },
    listResolvedEvents: () => Promise.resolve(params.events ?? []),
    appendComment: (comment) => {
      appendedComments.push(comment)
      return Promise.resolve()
    },
    appendResolvedEvent: (sha, event) => {
      appendedEvents.push({ sha, event })
      return Promise.resolve()
    },
    listCommitShasWithComments: () => Promise.resolve(params.shasWithComments ?? []),
  }
  return { store, appendedComments, appendedEvents, listedShas }
}

function makeService(
  store: ReviewStore,
  resolver: GitShaResolver = fakeResolver({}),
  newId: () => string = () => 'fixed-id',
) {
  return createReviewService({ store, shaResolver: resolver, now: () => FIXED_NOW, newId })
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
    const { store } = recordingStore({})
    const result = await makeService(store).listForRevision(parseRevision('HEAD'))
    expect(result.sha).toBe(SHA)
  })

  it('store のコメントに resolved 状態を合成して返す', async () => {
    const events: ResolvedEvent[] = [{ id: 'c1', resolved: true, ts: '2026-06-17T00:00:00.000Z' }]
    const { store } = recordingStore({ comments: [comment('c1'), comment('c2')], events })
    const result = await makeService(store).listForRevision(parseRevision('HEAD'))
    expect(result.comments.find((c) => c.id === 'c1')?.resolved).toBe(true)
    expect(result.comments.find((c) => c.id === 'c2')?.resolved).toBe(false)
  })

  it('解決後の SHA が 40 桁でなければ例外を投げる', async () => {
    const { store } = recordingStore({})
    await expect(
      makeService(store, fakeResolver({ resolved: 'not-a-sha' })).listForRevision(
        parseRevision('HEAD'),
      ),
    ).rejects.toThrow()
  })

  it('listComments には解決済み SHA が渡る', async () => {
    const { store, listedShas } = recordingStore({})
    await makeService(store).listForRevision(parseRevision('main'))
    expect(listedShas[0]?.value).toBe(SHA)
  })
})

describe('createReviewService.addComment', () => {
  it('注入された newId / now でコメントを構築し store に追記する', async () => {
    const { store, appendedComments } = recordingStore({})
    const created = await makeService(store, fakeResolver({}), () => 'generated-id').addComment({
      sha: SHA,
      path: 'src/foo.ts',
      newLineStart: 3,
      newLineEnd: 5,
      body: 'comment',
    })
    expect(created.id).toBe('generated-id')
    expect(created.createdAt).toBe(FIXED_NOW.toISOString())
    expect(created.resolved).toBe(false)
    expect(appendedComments).toHaveLength(1)
    expect(appendedComments[0]?.id).toBe('generated-id')
  })

  it('不正な行範囲は buildReviewComment 検証で例外を投げる', async () => {
    const { store } = recordingStore({})
    await expect(
      makeService(store).addComment({
        sha: SHA,
        path: 'src/foo.ts',
        newLineStart: 5,
        newLineEnd: 1,
        body: 'comment',
      }),
    ).rejects.toThrow()
  })

  it('実在しない commit SHA は拒否し store に追記しない (M2)', async () => {
    const { store, appendedComments } = recordingStore({})
    await expect(
      makeService(store, fakeResolver({ resolveError: true })).addComment({
        sha: SHA,
        path: 'src/foo.ts',
        newLineStart: 1,
        newLineEnd: 1,
        body: 'comment',
      }),
    ).rejects.toThrow()
    expect(appendedComments).toHaveLength(0)
  })
})

describe('createReviewService.setResolved', () => {
  it('対象 id が存在すれば resolved イベントを now の ts で追記する', async () => {
    const { store, appendedEvents } = recordingStore({ comments: [comment('c1')] })
    await makeService(store).setResolved({ sha: SHA, id: 'c1', resolved: true })
    expect(appendedEvents).toHaveLength(1)
    expect(appendedEvents[0]?.event).toEqual({
      id: 'c1',
      resolved: true,
      ts: FIXED_NOW.toISOString(),
    })
    expect(appendedEvents[0]?.sha.value).toBe(SHA)
  })

  it('空の id は例外を投げる', async () => {
    const { store } = recordingStore({ comments: [comment('c1')] })
    await expect(
      makeService(store).setResolved({ sha: SHA, id: '', resolved: true }),
    ).rejects.toThrow()
  })

  it('存在しない id は拒否し追記しない (M3)', async () => {
    const { store, appendedEvents } = recordingStore({ comments: [comment('c1')] })
    await expect(
      makeService(store).setResolved({ sha: SHA, id: 'nope', resolved: true }),
    ).rejects.toThrow()
    expect(appendedEvents).toHaveLength(0)
  })
})

describe('createReviewService.listCommitsWithCommentsInRange', () => {
  it('範囲内かつコメントを持つ SHA のみ返す (to を含む)', async () => {
    const otherInRange = 'a'.repeat(40)
    const outOfRange = 'b'.repeat(40)
    const { store } = recordingStore({ shasWithComments: [otherInRange, outOfRange, SHA] })
    // resolveCommitSha→SHA (to), revListRange→[otherInRange]
    const service = makeService(store, fakeResolver({ resolved: SHA, rangeShas: [otherInRange] }))

    const result = await service.listCommitsWithCommentsInRange(
      parseRevision('HEAD'),
      parseRevision('feature'),
    )

    expect([...result].sort()).toEqual([otherInRange, SHA].sort())
    expect(result).not.toContain(outOfRange)
  })
})
