import { describe, expect, it } from 'vitest'
import { InvalidReviewCommentError, InvalidDiffPathError } from './errors.js'
import {
  buildReviewComment,
  foldResolved,
  mergeResolved,
  parseReviewSha,
  type BuildReviewCommentInput,
  type ResolvedEvent,
  type ReviewComment,
} from './review.js'

const VALID_SHA = 'a'.repeat(40)

function validInput(overrides: Partial<BuildReviewCommentInput> = {}): BuildReviewCommentInput {
  return {
    id: '1700000000000-abc',
    sha: VALID_SHA,
    path: 'src/foo.ts',
    newLineStart: 10,
    newLineEnd: 12,
    body: 'looks wrong',
    createdAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('parseReviewSha', () => {
  it('40桁hexのSHAを受理する', () => {
    expect(parseReviewSha(VALID_SHA).value).toBe(VALID_SHA)
  })

  it('39桁のSHAを拒否する', () => {
    expect(() => parseReviewSha('a'.repeat(39))).toThrow(InvalidReviewCommentError)
  })

  it('41桁のSHAを拒否する', () => {
    expect(() => parseReviewSha('a'.repeat(41))).toThrow(InvalidReviewCommentError)
  })

  it('非hex文字を含むSHAを拒否する', () => {
    expect(() => parseReviewSha('g'.repeat(40))).toThrow(InvalidReviewCommentError)
  })

  it('大文字hexを拒否する', () => {
    expect(() => parseReviewSha('A'.repeat(40))).toThrow(InvalidReviewCommentError)
  })
})

describe('buildReviewComment', () => {
  it('正当な入力からReviewCommentを構築する', () => {
    const comment = buildReviewComment(validInput())
    expect(comment.sha.value).toBe(VALID_SHA)
    expect(comment.path).toBe('src/foo.ts')
    expect(comment.newLineStart).toBe(10)
    expect(comment.newLineEnd).toBe(12)
  })

  it('単一行範囲(start===end)を受理する', () => {
    const comment = buildReviewComment(validInput({ newLineStart: 5, newLineEnd: 5 }))
    expect(comment.newLineStart).toBe(5)
    expect(comment.newLineEnd).toBe(5)
  })

  it('start>endの行範囲を拒否する', () => {
    expect(() => buildReviewComment(validInput({ newLineStart: 12, newLineEnd: 10 }))).toThrow(
      InvalidReviewCommentError,
    )
  })

  it('newLineStartが0以下の行範囲を拒否する', () => {
    expect(() => buildReviewComment(validInput({ newLineStart: 0, newLineEnd: 0 }))).toThrow(
      InvalidReviewCommentError,
    )
  })

  it('非整数の行番号を拒否する', () => {
    expect(() => buildReviewComment(validInput({ newLineStart: 1.5, newLineEnd: 2 }))).toThrow(
      InvalidReviewCommentError,
    )
  })

  it('空のコメント本文を拒否する', () => {
    expect(() => buildReviewComment(validInput({ body: '' }))).toThrow(InvalidReviewCommentError)
  })

  it('空白のみのコメント本文を拒否する', () => {
    expect(() => buildReviewComment(validInput({ body: '   \n\t' }))).toThrow(
      InvalidReviewCommentError,
    )
  })

  it('空のidを拒否する', () => {
    expect(() => buildReviewComment(validInput({ id: '' }))).toThrow(InvalidReviewCommentError)
  })

  it('40桁でないSHAを拒否する', () => {
    expect(() => buildReviewComment(validInput({ sha: 'abc' }))).toThrow(InvalidReviewCommentError)
  })

  it('不正なpath(..を含む)はInvalidDiffPathErrorを伝播する', () => {
    expect(() => buildReviewComment(validInput({ path: '../escape' }))).toThrow(
      InvalidDiffPathError,
    )
  })
})

describe('foldResolved', () => {
  function event(id: string, resolved: boolean, ts: string): ResolvedEvent {
    return { id, resolved, ts }
  }

  it('イベントが無ければ空のMapを返す', () => {
    expect(foldResolved([]).size).toBe(0)
  })

  it('同一idは後勝ちで畳み込む', () => {
    const folded = foldResolved([
      event('c1', true, '2026-06-17T00:00:00.000Z'),
      event('c1', false, '2026-06-17T00:01:00.000Z'),
    ])
    expect(folded.get('c1')).toBe(false)
  })

  it('複数idをそれぞれ保持する', () => {
    const folded = foldResolved([
      event('c1', true, '2026-06-17T00:00:00.000Z'),
      event('c2', true, '2026-06-17T00:00:01.000Z'),
    ])
    expect(folded.get('c1')).toBe(true)
    expect(folded.get('c2')).toBe(true)
  })
})

describe('mergeResolved', () => {
  function comment(id: string): ReviewComment {
    return buildReviewComment(validInput({ id }))
  }

  it('resolvedイベントに無いidは未解決(false)になる', () => {
    const merged = mergeResolved([comment('c1')], new Map())
    expect(merged[0]?.resolved).toBe(false)
  })

  it('resolvedイベントにあるidはその値を反映する', () => {
    const merged = mergeResolved([comment('c1')], new Map([['c1', true]]))
    expect(merged[0]?.resolved).toBe(true)
  })
})
