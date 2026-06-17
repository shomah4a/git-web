import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReviewComment, type ResolvedEvent, type ReviewSha } from '../../domain/review.js'
import { serializeComment } from './jsonl-review-codec.js'
import { createJsonlReviewStore, type ReviewStoreFs } from './jsonl-review-store.js'

const REVIEWS_DIR = '/repo/.git-web/reviews'
const VALID_SHA = 'c'.repeat(40)

/**
 * インメモリの fake fs (mock ライブラリ不使用)。
 * readFile は未存在で ENOENT を投げ、appendFile は追記、mkdir は記録のみ。
 */
function createFakeFs(): { files: Map<string, string>; fs: ReviewStoreFs } {
  const files = new Map<string, string>()
  return {
    files,
    fs: {
      readFile: (path: string): Promise<string> => {
        const content = files.get(path)
        if (content === undefined) {
          const err: NodeJS.ErrnoException = new Error(`ENOENT: ${path}`)
          err.code = 'ENOENT'
          return Promise.reject(err)
        }
        return Promise.resolve(content)
      },
      appendFile: (path: string, data: string): Promise<void> => {
        files.set(path, (files.get(path) ?? '') + data)
        return Promise.resolve()
      },
      mkdir: (): Promise<void> => Promise.resolve(),
    },
  }
}

function sha(value: string): ReviewSha {
  return { value }
}

function sampleComment(id: string) {
  return buildReviewComment({
    id,
    sha: VALID_SHA,
    path: 'src/foo.ts',
    newLineStart: 1,
    newLineEnd: 2,
    body: 'body',
    createdAt: '2026-06-17T00:00:00.000Z',
  })
}

describe('createJsonlReviewStore', () => {
  it('appendCommentで追記した内容をlistCommentsで読み出せる', async () => {
    const { fs } = createFakeFs()
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })

    await store.appendComment(sampleComment('c1'))
    const comments = await store.listComments(sha(VALID_SHA))

    expect(comments).toHaveLength(1)
    expect(comments[0]?.id).toBe('c1')
  })

  it('複数のappendCommentが追記順で読み出される', async () => {
    const { fs } = createFakeFs()
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })

    await store.appendComment(sampleComment('c1'))
    await store.appendComment(sampleComment('c2'))
    const comments = await store.listComments(sha(VALID_SHA))

    expect(comments.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('ファイル未存在のlistCommentsは空配列を返す', async () => {
    const { fs } = createFakeFs()
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })

    expect(await store.listComments(sha(VALID_SHA))).toEqual([])
  })

  it('壊れた行はスキップして有効な行のみ返す', async () => {
    const { files, fs } = createFakeFs()
    const path = resolve(REVIEWS_DIR, `${VALID_SHA}.jsonl`)
    files.set(path, serializeComment(sampleComment('c1')) + '\n' + 'broken line\n')
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })

    const comments = await store.listComments(sha(VALID_SHA))
    expect(comments.map((c) => c.id)).toEqual(['c1'])
  })

  it('resolvedイベントを追記順で読み出せる', async () => {
    const { fs } = createFakeFs()
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })
    const e1: ResolvedEvent = { id: 'c1', resolved: true, ts: '2026-06-17T00:00:00.000Z' }
    const e2: ResolvedEvent = { id: 'c1', resolved: false, ts: '2026-06-17T00:01:00.000Z' }

    await store.appendResolvedEvent(sha(VALID_SHA), e1)
    await store.appendResolvedEvent(sha(VALID_SHA), e2)
    const events = await store.listResolvedEvents(sha(VALID_SHA))

    expect(events).toEqual([e1, e2])
  })

  it('reviewsDirの外へ脱出するshaは書き込みを拒否する(二層防御)', async () => {
    const { fs } = createFakeFs()
    const store = createJsonlReviewStore({ reviewsDir: REVIEWS_DIR, fs })
    // parseReviewSha を経ないと作れない値だが、二層防御として構造的に検証する
    const malicious = sha('../../etc/passwd')

    await expect(
      store.appendResolvedEvent(malicious, { id: 'x', resolved: true, ts: 't' }),
    ).rejects.toThrow(/escapes reviewsDir/)
  })
})
