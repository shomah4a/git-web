import { describe, expect, it } from 'vitest'
import { parseTreeCommitsOutput } from './tree-commits-parser.js'

describe('parseTreeCommitsOutput', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseTreeCommitsOutput('')).toEqual([])
  })

  it('単一コミット・単一パスをパースできる', () => {
    // \x00 hash \x01 date \x01 subject \x01 namesBlock
    const input = '\0abc1234\x011745193200\x01initial commit\x01src/foo.ts\n'

    expect(parseTreeCommitsOutput(input)).toEqual([
      {
        hash: 'abc1234',
        date: 1745193200,
        subject: 'initial commit',
        paths: ['src/foo.ts'],
      },
    ])
  })

  it('単一コミット・複数パスをパースできる', () => {
    const input = '\0abc1234\x011745193200\x01add files\x01src/foo.ts\nsrc/bar.ts\nREADME.md\n'

    expect(parseTreeCommitsOutput(input)).toEqual([
      expect.objectContaining({
        hash: 'abc1234',
        paths: ['src/foo.ts', 'src/bar.ts', 'README.md'],
      }),
    ])
  })

  it('複数コミットをパースできる', () => {
    const input =
      '\0aaa1111\x011745193200\x01first\x01a.ts\n' +
      '\0bbb2222\x011745196800\x01second\x01b.ts\nc.ts\n'

    expect(parseTreeCommitsOutput(input)).toEqual([
      { hash: 'aaa1111', date: 1745193200, subject: 'first', paths: ['a.ts'] },
      { hash: 'bbb2222', date: 1745196800, subject: 'second', paths: ['b.ts', 'c.ts'] },
    ])
  })

  it('パス変更のないコミット (--name-only ブロック空) も保持する', () => {
    // -m --first-parent でもファイル変更が出ないことがある (空マージ等)
    const input = '\0abc1234\x011745193200\x01empty merge\x01'

    expect(parseTreeCommitsOutput(input)).toEqual([
      { hash: 'abc1234', date: 1745193200, subject: 'empty merge', paths: [] },
    ])
  })

  it('subject に SOH 以外の特殊文字が含まれていてもそのまま保持する', () => {
    const input = '\0abc1234\x011745193200\x01fix: 100% [a]:b\x01src/foo.ts\n'

    expect(parseTreeCommitsOutput(input)).toEqual([
      expect.objectContaining({ subject: 'fix: 100% [a]:b' }),
    ])
  })

  it('日付が数値化できない場合はレコードを捨てる', () => {
    const input = '\0abc1234\x01not-a-number\x01subject\x01file.ts\n'

    expect(parseTreeCommitsOutput(input)).toEqual([])
  })

  it('hash が空のレコードは捨てる', () => {
    const input = '\0\x011745193200\x01subject\x01file.ts\n'

    expect(parseTreeCommitsOutput(input)).toEqual([])
  })

  it('途中の空白行・末尾改行はパス配列に含めない', () => {
    const input = '\0abc1234\x011745193200\x01s\x01a.ts\n\nb.ts\n\n'

    expect(parseTreeCommitsOutput(input)).toEqual([
      expect.objectContaining({ paths: ['a.ts', 'b.ts'] }),
    ])
  })
})
