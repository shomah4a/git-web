import { describe, expect, it } from 'vitest'
import { buildReviewComment, type ResolvedEvent } from '../../domain/review.js'
import {
  parseComment,
  parseResolvedEvent,
  serializeComment,
  serializeResolvedEvent,
} from './jsonl-review-codec.js'

const VALID_SHA = 'b'.repeat(40)

function sampleComment() {
  return buildReviewComment({
    id: '1700000000000-xyz',
    sha: VALID_SHA,
    path: 'src/foo.ts',
    newLineStart: 3,
    newLineEnd: 7,
    body: 'コメント本文\nに改行を含む',
    createdAt: '2026-06-17T00:00:00.000Z',
  })
}

describe('serializeComment / parseComment', () => {
  it('ReviewCommentをJSONL1行に変換し往復で同値になる', () => {
    const comment = sampleComment()
    const line = serializeComment(comment)
    expect(line).not.toContain('\n') // 1行に収まる (本文の改行はエスケープされる)
    const parsed = parseComment(line)
    expect(parsed).toEqual(comment)
  })

  it('JSON以外の行はパース時に例外を投げる', () => {
    expect(() => parseComment('not json')).toThrow()
  })

  it('必須フィールド欠落の行は例外を投げる', () => {
    expect(() => parseComment(JSON.stringify({ id: 'x', sha: VALID_SHA }))).toThrow()
  })

  it('不正な行範囲を持つ行はbuildReviewComment検証で例外を投げる', () => {
    const broken = JSON.stringify({
      id: 'x',
      sha: VALID_SHA,
      path: 'a.ts',
      newLineStart: 5,
      newLineEnd: 1,
      body: 'b',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    expect(() => parseComment(broken)).toThrow()
  })
})

describe('serializeResolvedEvent / parseResolvedEvent', () => {
  it('ResolvedEventを往復で同値に変換する', () => {
    const event: ResolvedEvent = { id: 'c1', resolved: true, ts: '2026-06-17T00:00:00.000Z' }
    expect(parseResolvedEvent(serializeResolvedEvent(event))).toEqual(event)
  })

  it('resolvedがbooleanでない行は例外を投げる', () => {
    const broken = JSON.stringify({ id: 'c1', resolved: 'yes', ts: '2026-06-17T00:00:00.000Z' })
    expect(() => parseResolvedEvent(broken)).toThrow()
  })

  it('空のidは例外を投げる', () => {
    const broken = JSON.stringify({ id: '', resolved: true, ts: '2026-06-17T00:00:00.000Z' })
    expect(() => parseResolvedEvent(broken)).toThrow()
  })
})
