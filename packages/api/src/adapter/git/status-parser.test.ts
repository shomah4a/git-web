import { describe, expect, it } from 'vitest'
import { parseStatusZ } from './status-parser.js'

describe('parseStatusZ', () => {
  it('空文字列は空 Map を返す', () => {
    expect(parseStatusZ('')).toEqual(new Map())
  })

  it('untracked ファイルを解析できる', () => {
    const input = '?? newfile.txt\0'
    const result = parseStatusZ(input)
    expect(result.get('newfile.txt')).toBe('untracked')
  })

  it('staged added ファイルを解析できる', () => {
    const input = 'A  staged.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('staged.ts')).toBe('added')
  })

  it('modified ファイルを解析できる (unstaged)', () => {
    const input = ' M changed.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('changed.ts')).toBe('modified')
  })

  it('modified ファイルを解析できる (staged)', () => {
    const input = 'M  changed.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('changed.ts')).toBe('modified')
  })

  it('deleted ファイルを解析できる', () => {
    const input = ' D removed.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('removed.ts')).toBe('deleted')
  })

  it('rename は modified として扱う', () => {
    const input = 'R  new.ts\0old.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('new.ts')).toBe('modified')
    // old_path は Map に入らない
    expect(result.has('old.ts')).toBe(false)
  })

  it('複数エントリを解析できる', () => {
    const input = '?? untracked.txt\0 M modified.ts\0A  added.ts\0'
    const result = parseStatusZ(input)
    expect(result.size).toBe(3)
    expect(result.get('untracked.txt')).toBe('untracked')
    expect(result.get('modified.ts')).toBe('modified')
    expect(result.get('added.ts')).toBe('added')
  })

  it('サブディレクトリ内のファイルもパスを保持する', () => {
    const input = '?? src/new.ts\0 M packages/api/main.ts\0'
    const result = parseStatusZ(input)
    expect(result.get('src/new.ts')).toBe('untracked')
    expect(result.get('packages/api/main.ts')).toBe('modified')
  })
})
