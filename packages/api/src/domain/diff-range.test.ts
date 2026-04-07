import { describe, expect, it } from 'vitest'
import { buildDiffRange } from './diff-range.js'
import { InvalidDiffRangeError } from './errors.js'
import { parseRevision } from './revision.js'

describe('buildDiffRange', () => {
  it('fromとtoが両方undefinedならworking-vs-headを返す', () => {
    const range = buildDiffRange(undefined, undefined)

    expect(range).toEqual({ kind: 'working-vs-head' })
  })

  it('fromのみ指定ならworking-vs-revを返す', () => {
    const from = parseRevision('HEAD~1')

    const range = buildDiffRange(from, undefined)

    expect(range).toEqual({ kind: 'working-vs-rev', from })
  })

  it('fromとtoが両方指定ならrev-vs-revを返す', () => {
    const from = parseRevision('HEAD~2')
    const to = parseRevision('HEAD')

    const range = buildDiffRange(from, to)

    expect(range).toEqual({ kind: 'rev-vs-rev', from, to })
  })

  it('toだけ指定はInvalidDiffRangeErrorを投げる', () => {
    const to = parseRevision('HEAD')

    expect(() => buildDiffRange(undefined, to)).toThrow(InvalidDiffRangeError)
  })

  it('InvalidDiffRangeErrorのreasonに理由が含まれる', () => {
    const to = parseRevision('HEAD')

    try {
      buildDiffRange(undefined, to)
      throw new Error('expected to throw')
    } catch (err) {
      if (!(err instanceof InvalidDiffRangeError)) {
        throw err
      }
      expect(err.reason).toBe('to specified without from')
    }
  })
})
