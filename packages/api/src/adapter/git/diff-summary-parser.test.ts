import { describe, expect, it } from 'vitest'
import { parseNumstatZ, parseRawZ } from './diff-summary-parser.js'

describe('parseRawZ', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseRawZ('')).toEqual([])
  })

  it('1 ファイルの A エントリをパースできる', () => {
    const input = ':000000 100644 0000000 5663091 A\u0000bin.dat\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'bin.dat', oldPath: null, status: 'added' }])
  })

  it('1 ファイルの M エントリをパースできる', () => {
    const input = ':100644 100644 abcd001 abcd002 M\u0000foo.ts\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'foo.ts', oldPath: null, status: 'modified' }])
  })

  it('1 ファイルの D エントリをパースできる', () => {
    const input = ':100644 000000 abcd001 0000000 D\u0000bar.ts\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'bar.ts', oldPath: null, status: 'deleted' }])
  })

  it('R エントリは modified に丸められ oldPath は null になる', () => {
    const input = ':100644 100644 26ffc0d b7a95e4 R067\u0000old.txt\u0000new.txt\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'new.txt', oldPath: null, status: 'modified' }])
  })

  it('C エントリも modified に丸められる', () => {
    const input = ':100644 100644 26ffc0d b7a95e4 C080\u0000src.ts\u0000dst.ts\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'dst.ts', oldPath: null, status: 'modified' }])
  })

  it('複数エントリ (A, R, A) を順にパースする (スパイク Case 8 と同等)', () => {
    const input =
      ':000000 100644 0000000 5663091 A\u0000bin.dat\u0000' +
      ':100644 100644 26ffc0d b7a95e4 R067\u0000new.txt\u0000nonewline.txt\u0000' +
      ':000000 100644 0000000 c2119dc A\u0000renamed.py\u0000'

    expect(parseRawZ(input)).toEqual([
      { path: 'bin.dat', oldPath: null, status: 'added' },
      { path: 'nonewline.txt', oldPath: null, status: 'modified' },
      { path: 'renamed.py', oldPath: null, status: 'added' },
    ])
  })

  it('T (type changed) は modified 扱い', () => {
    const input = ':100644 120000 abcd001 abcd002 T\u0000link.txt\u0000'

    expect(parseRawZ(input)).toEqual([{ path: 'link.txt', oldPath: null, status: 'modified' }])
  })
})

describe('parseNumstatZ', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseNumstatZ('')).toEqual([])
  })

  it('通常のエントリをパースできる', () => {
    const input = '3\t1\tfoo.ts\u0000'

    expect(parseNumstatZ(input)).toEqual([{ path: 'foo.ts', additions: 3, deletions: 1 }])
  })

  it('バイナリファイルは additions / deletions が null', () => {
    const input = '-\t-\tbin.dat\u0000'

    expect(parseNumstatZ(input)).toEqual([{ path: 'bin.dat', additions: null, deletions: null }])
  })

  it('リネームエントリは newPath を採用する (スパイク Case 9 と同等)', () => {
    const input = '1\t1\t\u0000old.txt\u0000new.txt\u0000'

    expect(parseNumstatZ(input)).toEqual([{ path: 'new.txt', additions: 1, deletions: 1 }])
  })

  it('複数エントリ (バイナリ, リネーム, 通常) をパースする', () => {
    const input =
      '-\t-\tbin.dat\u0000' + '1\t1\t\u0000old.txt\u0000new.txt\u0000' + '2\t0\tnew.py\u0000'

    expect(parseNumstatZ(input)).toEqual([
      { path: 'bin.dat', additions: null, deletions: null },
      { path: 'new.txt', additions: 1, deletions: 1 },
      { path: 'new.py', additions: 2, deletions: 0 },
    ])
  })
})
