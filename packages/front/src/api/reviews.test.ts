import { describe, expect, it } from 'vitest'
import { isReviewCommentDto } from './reviews.js'

const SHA = 'a'.repeat(40)

function validDto(): Record<string, unknown> {
  return {
    id: 'c1',
    sha: SHA,
    path: 'src/foo.ts',
    newLineStart: 1,
    newLineEnd: 2,
    body: 'comment',
    createdAt: '2026-06-17T00:00:00.000Z',
    resolved: false,
  }
}

describe('isReviewCommentDto', () => {
  it('正当な DTO を受理する', () => {
    expect(isReviewCommentDto(validDto())).toBe(true)
  })

  it('40桁でない sha を拒否する', () => {
    expect(isReviewCommentDto({ ...validDto(), sha: 'abc' })).toBe(false)
  })

  it('resolved が boolean でなければ拒否する', () => {
    expect(isReviewCommentDto({ ...validDto(), resolved: 'no' })).toBe(false)
  })

  it('newLineStart が無ければ拒否する', () => {
    const dto = validDto()
    delete dto.newLineStart
    expect(isReviewCommentDto(dto)).toBe(false)
  })

  it('null を拒否する', () => {
    expect(isReviewCommentDto(null)).toBe(false)
  })
})
