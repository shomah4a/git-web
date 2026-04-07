import { describe, expect, it } from 'vitest'
import { InvalidRevisionError } from './errors.js'
import { parseRevision } from './revision.js'

describe('parseRevision', () => {
  describe('許可される形式', () => {
    const accepted: ReadonlyArray<[string, string]> = [
      ['HEAD', 'HEAD そのもの'],
      ['abcd', '4文字SHA'],
      ['0123456789abcdef0123456789abcdef01234567', '40文字完全SHA'],
      ['abc1234', '一般的な7文字短縮SHA'],
      ['HEAD~1', 'HEAD~1'],
      ['HEAD~10', 'HEAD~10'],
      ['HEAD~999', 'HEAD~999 (最大桁数)'],
      ['HEAD^', 'HEAD^ のみ'],
      ['HEAD^1', 'HEAD^1'],
    ]

    for (const [input, desc] of accepted) {
      it(`${desc}: ${input} を受け入れて raw が ${input} の Revision を返す`, () => {
        const rev = parseRevision(input)
        expect(rev.raw).toBe(input)
      })
    }
  })

  describe('拒否される形式', () => {
    const rejected: ReadonlyArray<[string, string]> = [
      ['', '空文字列'],
      ['main', 'ブランチ名'],
      ['v1.0.0', 'タグ名'],
      ['refs/heads/main', 'refs/ フルパス'],
      ['HEAD@{1}', 'HEAD@{1} reflog 形式'],
      ['HEAD~1000', 'HEAD~ の N が4桁'],
      ['HEAD~', 'HEAD~ のみ'],
      ['HEAD^10', 'HEAD^ の N が2桁'],
      ['ABCD', '大文字 SHA'],
      ['abc', '3文字 (短すぎ)'],
      ['0123456789abcdef0123456789abcdef012345678', '41文字 (長すぎ)'],
      ['abc xyz', '空白入り'],
      ['--', '-- 区切り文字'],
      ['HEAD;', 'セミコロン混入'],
      ['HEAD\u0000', 'NUL バイト混入'],
      ['HEAD$()', 'シェルメタ文字'],
    ]

    for (const [input, desc] of rejected) {
      it(`${desc}: ${JSON.stringify(input)} は InvalidRevisionError を throw する`, () => {
        expect(() => parseRevision(input)).toThrow(InvalidRevisionError)
      })
    }
  })

  it('エラーの input プロパティに元の入力が保持される', () => {
    try {
      parseRevision('bad')
      throw new Error('expected to throw')
    } catch (err) {
      if (!(err instanceof InvalidRevisionError)) {
        throw err
      }
      expect(err.input).toBe('bad')
    }
  })
})
