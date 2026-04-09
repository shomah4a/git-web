import { describe, expect, it } from 'vitest'
import { InvalidRevisionError } from './errors.js'
import { parseRevision } from './revision.js'

describe('parseRevision', () => {
  describe('許可される形式', () => {
    const accepted: ReadonlyArray<[string, string]> = [
      // 既存許可
      ['HEAD', 'HEAD そのもの'],
      ['abcd', '4文字SHA'],
      ['0123456789abcdef0123456789abcdef01234567', '40文字完全SHA'],
      ['abc1234', '一般的な7文字短縮SHA'],
      ['HEAD~1', 'HEAD~1'],
      ['HEAD~10', 'HEAD~10'],
      ['HEAD~999', 'HEAD~999 (最大桁数)'],
      ['HEAD^', 'HEAD^ のみ'],
      ['HEAD^1', 'HEAD^1'],
      // ADR 0018 で追加
      ['HEAD^^', 'HEAD^ の 2 連'],
      ['HEAD^^^', 'HEAD^ の 3 連'],
      ['HEAD^2', 'HEAD^2 (マージの第2親)'],
      ['HEAD^^~1', '^ と ~ の連結'],
      ['main', '短いブランチ名'],
      ['feature/foo', 'スラッシュ入りブランチ名'],
      ['feature/foo-bar_baz.1', '記号入りブランチ名'],
      ['v1.0.0', 'ドット入りタグ名'],
      ['release-1.2', 'ハイフン入りブランチ名'],
      ['refs/heads/main', 'refs/heads/ フルパス'],
      ['refs/tags/v1.0.0', 'refs/tags/ フルパス'],
      ['main~3', 'ブランチ名 + ~N'],
      ['feature/foo^2', 'ブランチ名 + ^N'],
      ['v1.0.0^', 'タグ名 + ^'],
    ]

    for (const [input, desc] of accepted) {
      it(`${desc}: ${input} を受け入れて raw が ${input} の Revision を返す`, () => {
        const rev = parseRevision(input)
        expect(rev.raw).toBe(input)
      })
    }
  })

  describe('拒否される形式', () => {
    const rejected: ReadonlyArray<[string, string, string]> = [
      ['', '空文字列', 'empty'],
      ['HEAD@{1}', 'HEAD@{1} reflog 形式', 'reflog-form'],
      ['main@{0}', 'reflog 形式 (branch)', 'reflog-form'],
      ['HEAD~1000', 'HEAD~ の N が4桁', 'bad-modifier'],
      ['HEAD~', 'HEAD~ のみ (数字なし)', 'bad-modifier'],
      ['HEAD^10', 'HEAD^ の N が2桁', 'bad-modifier'],
      ['ABCD', '大文字 SHA は受けない (ref 名としては受理)', 'ignored'],
      // 上記 ABCD は実際には ref 名として受理されるので、後で別扱い
      ['abc', '3文字 (短すぎ)', 'ignored'],
      ['0123456789abcdef0123456789abcdef012345678', '41文字だが ref 名としても非妥当', 'ignored'],
      ['abc xyz', '空白入り', 'forbidden-chars'],
      ['--flag', '先頭ハイフン', 'shape'],
      ['-abc', '先頭ハイフン', 'shape'],
      ['/abs', '先頭スラッシュ', 'shape'],
      ['HEAD;', 'セミコロン混入', 'forbidden-chars'],
      ['HEAD\u0000', 'NUL バイト混入', 'forbidden-chars'],
      ['HEAD$()', 'シェルメタ文字', 'forbidden-chars'],
      ['main..feature', '.. を含む', 'shape'],
      ['main//feature', '// を含む', 'shape'],
      ['feature/', '末尾スラッシュ', 'shape'],
      ['refs/heads/main.lock', '末尾 .lock', 'shape'],
      ['a'.repeat(256), '256 文字', 'too-long'],
    ]

    // SHA 形式には合わないが ref 名としては妥当な入力は除外する
    // (ABCD / abc / 41 文字は分類が難しいので個別テスト)
    const onlyRejected = rejected.filter(([, , reason]) => reason !== 'ignored')

    for (const [input, desc, expectedReason] of onlyRejected) {
      it(`${desc}: ${JSON.stringify(input)} は InvalidRevisionError (${expectedReason}) を throw する`, () => {
        try {
          parseRevision(input)
          throw new Error('expected to throw')
        } catch (err) {
          if (!(err instanceof InvalidRevisionError)) {
            throw err
          }
          expect(err.reason).toBe(expectedReason)
        }
      })
    }
  })

  describe('ref 名としても妥当な入力の扱い', () => {
    // ADR 0018 では SHA 形式に合致しなくても ref 名として受理する
    // 以下は ref 名正規表現には合致するため受理される
    it('ABCD は ref 名として受理される (大文字英字のみ)', () => {
      expect(parseRevision('ABCD').raw).toBe('ABCD')
    })
    it('abc (3 文字) は ref 名として受理される', () => {
      expect(parseRevision('abc').raw).toBe('abc')
    })
  })

  it('エラーの input プロパティに元の入力が保持される', () => {
    try {
      parseRevision('bad name with spaces')
      throw new Error('expected to throw')
    } catch (err) {
      if (!(err instanceof InvalidRevisionError)) {
        throw err
      }
      expect(err.input).toBe('bad name with spaces')
      expect(err.reason).toBe('forbidden-chars')
    }
  })
})
