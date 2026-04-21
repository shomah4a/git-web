import { describe, expect, it } from 'vitest'
import { parseLogOutput } from './log-parser.js'

describe('parseLogOutput', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseLogOutput('')).toEqual([])
  })

  it('numstat なしの単一コミットをパースできる', () => {
    // hash \x01 parents \x01 authorName \x01 email \x01 date \x01 subject \x01 body \x01
    const input =
      '\0abc1234\x01def5678\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01initial commit\x01\x01'

    expect(parseLogOutput(input)).toEqual([
      {
        hash: 'abc1234',
        parentCount: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        date: '2026-04-21T10:00:00+09:00',
        subject: 'initial commit',
        body: '',
        stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      },
    ])
  })

  it('numstat 付きの単一コミットをパースできる', () => {
    const input =
      '\0abc1234\x01def5678\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01add files\x01\x01' +
      '10\t2\tsrc/foo.ts\n3\t0\tsrc/bar.ts\n'

    const result = parseLogOutput(input)

    expect(result).toHaveLength(1)
    expect(result).toEqual([
      expect.objectContaining({
        stats: { filesChanged: 2, insertions: 13, deletions: 2 },
      }),
    ])
  })

  it('バイナリファイルの numstat は insertions/deletions が 0 として扱われる', () => {
    const input =
      '\0abc1234\x01def5678\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01add image\x01\x01' +
      '-\t-\timage.png\n5\t1\tREADME.md\n'

    expect(parseLogOutput(input)).toEqual([
      expect.objectContaining({
        stats: { filesChanged: 2, insertions: 5, deletions: 1 },
      }),
    ])
  })

  it('複数コミットをパースできる', () => {
    const input =
      '\0aaa1111\x01parent1\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01first\x01body1\x01' +
      '1\t0\ta.ts\n' +
      '\0bbb2222\x01parent2\x01Bob\x01bob@example.com\x012026-04-21T11:00:00+09:00\x01second\x01\x01' +
      '2\t3\tb.ts\n'

    expect(parseLogOutput(input)).toEqual([
      {
        hash: 'aaa1111',
        parentCount: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        date: '2026-04-21T10:00:00+09:00',
        subject: 'first',
        body: 'body1',
        stats: { filesChanged: 1, insertions: 1, deletions: 0 },
      },
      {
        hash: 'bbb2222',
        parentCount: 1,
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
        date: '2026-04-21T11:00:00+09:00',
        subject: 'second',
        body: '',
        stats: { filesChanged: 1, insertions: 2, deletions: 3 },
      },
    ])
  })

  it('改行を含むコミットメッセージ body をパースできる', () => {
    const body = 'line1\nline2\nline3'
    const input =
      '\0abc1234\x01def5678\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01subject\x01' +
      body +
      '\x01' +
      '1\t0\ta.ts\n'

    expect(parseLogOutput(input)).toEqual([
      expect.objectContaining({
        body,
        stats: { filesChanged: 1, insertions: 1, deletions: 0 },
      }),
    ])
  })

  it('マージコミットで numstat が空の場合は統計が全て 0 になる', () => {
    const input =
      '\0abc1234\x01parent1 parent2\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01Merge branch main\x01\x01'

    expect(parseLogOutput(input)).toEqual([
      expect.objectContaining({
        parentCount: 2,
        stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      }),
    ])
  })

  it('ルートコミットは parentCount が 0 になる', () => {
    const input =
      '\0abc1234\x01\x01Alice\x01alice@example.com\x012026-04-21T10:00:00+09:00\x01init\x01\x01'

    expect(parseLogOutput(input)).toEqual([
      expect.objectContaining({
        parentCount: 0,
      }),
    ])
  })
})
