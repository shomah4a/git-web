import { describe, expect, it } from 'vitest'
import { InvalidRefsQueryError } from './errors.js'
import { parseRefsQuery } from './refs-query.js'

describe('parseRefsQuery', () => {
  it('両方省略で既定値 (q 空文字列 / limit 100) を返す', () => {
    const query = parseRefsQuery(null, null)
    expect(query).toEqual({ q: '', limit: 100 })
  })

  it('q が与えられたらそのまま保持する', () => {
    const query = parseRefsQuery('feat', null)
    expect(query.q).toBe('feat')
  })

  it('limit を整数として受け付ける', () => {
    const query = parseRefsQuery(null, '50')
    expect(query.limit).toBe(50)
  })

  it('q 255 文字は受理する', () => {
    const q = 'a'.repeat(255)
    const query = parseRefsQuery(q, null)
    expect(query.q).toBe(q)
  })

  it('q 256 文字は InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery('a'.repeat(256), null)).toThrow(InvalidRefsQueryError)
  })

  it('q に制御文字が含まれると InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery('foo\u0000bar', null)).toThrow(InvalidRefsQueryError)
  })

  it('limit が整数形式でないと InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery(null, 'abc')).toThrow(InvalidRefsQueryError)
    expect(() => parseRefsQuery(null, '-1')).toThrow(InvalidRefsQueryError)
    expect(() => parseRefsQuery(null, '1.5')).toThrow(InvalidRefsQueryError)
  })

  it('limit 0 は InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery(null, '0')).toThrow(InvalidRefsQueryError)
  })

  it('limit 501 は InvalidRefsQueryError', () => {
    expect(() => parseRefsQuery(null, '501')).toThrow(InvalidRefsQueryError)
  })

  it('limit 500 (境界) は受理', () => {
    expect(parseRefsQuery(null, '500').limit).toBe(500)
  })

  it('limit 1 (境界) は受理', () => {
    expect(parseRefsQuery(null, '1').limit).toBe(1)
  })
})
