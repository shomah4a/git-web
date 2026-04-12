import { describe, expect, it } from 'vitest'
import { InvalidRefsQueryError } from './errors.js'
import { parseRefsQuery } from './refs-query.js'

describe('parseRefsQuery', () => {
  it('省略で既定値_q_空文字列を返す', () => {
    const query = parseRefsQuery(null)
    expect(query).toEqual({ q: '' })
  })

  it('q_が与えられたらそのまま保持する', () => {
    const query = parseRefsQuery('feat')
    expect(query.q).toBe('feat')
  })

  it('q_255文字は受理する', () => {
    const q = 'a'.repeat(255)
    const query = parseRefsQuery(q)
    expect(query.q).toBe(q)
  })

  it('q_256文字は_InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery('a'.repeat(256))).toThrow(InvalidRefsQueryError)
  })

  it('q_に制御文字が含まれると_InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery('foo\u0000bar')).toThrow(InvalidRefsQueryError)
  })
})
