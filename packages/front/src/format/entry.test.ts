import { describe, it, expect } from 'vitest'
import { formatMode, formatSize } from './entry.js'

describe('formatMode', () => {
  it('通常ファイル 100644 を -rw-r--r-- に変換する', () => {
    expect(formatMode({ mode: '100644' })).toBe('-rw-r--r--')
  })

  it('実行可能ファイル 100755 を -rwxr-xr-x に変換する', () => {
    expect(formatMode({ mode: '100755' })).toBe('-rwxr-xr-x')
  })

  it('ディレクトリ 040000 を d--------- に変換する', () => {
    expect(formatMode({ mode: '040000' })).toBe('d---------')
  })

  it('シンボリックリンク 120000 を l--------- に変換する', () => {
    expect(formatMode({ mode: '120000' })).toBe('l---------')
  })

  it('submodule 160000 を m--------- に変換する', () => {
    expect(formatMode({ mode: '160000' })).toBe('m---------')
  })

  it('null の場合は - を返す', () => {
    expect(formatMode({ mode: null })).toBe('-')
  })

  it('パース不能な文字列はそのまま返す', () => {
    expect(formatMode({ mode: 'invalid' })).toBe('invalid')
  })

  it('空文字列はそのまま返す', () => {
    expect(formatMode({ mode: '' })).toBe('')
  })
})

describe('formatSize', () => {
  it('null の場合は - を返す', () => {
    expect(formatSize({ size: null })).toBe('-')
  })

  it('1024 未満はバイト表示する', () => {
    expect(formatSize({ size: 512 })).toBe('512 B')
  })

  it('1024 以上 1MB 未満は KB 表示する', () => {
    expect(formatSize({ size: 2048 })).toBe('2.0 KB')
  })

  it('1MB 以上は MB 表示する', () => {
    expect(formatSize({ size: 1048576 })).toBe('1.0 MB')
  })
})
