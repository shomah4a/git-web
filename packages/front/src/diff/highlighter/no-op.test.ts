import { describe, expect, it } from 'vitest'
import { createNoOpHighlighter } from './no-op.js'

describe('createNoOpHighlighter', () => {
  const highlighter = createNoOpHighlighter()

  describe('preload', () => {
    it('は任意の言語で即座に resolve する', async () => {
      await expect(highlighter.preload('typescript')).resolves.toBeUndefined()
      await expect(highlighter.preload('unknown-lang')).resolves.toBeUndefined()
    })
  })

  describe('highlightFile', () => {
    // 仕様は Shiki v4 の codeToTokens に揃える (ADR 0017 / 計画書 step 4-3 cross-check)
    it('空文字を渡すと長さ 1 の空行を返す', async () => {
      const result = await highlighter.highlightFile('', 'typescript')
      expect(result).toStrictEqual([[]])
    })

    it('改行なしの 1 行を渡すと長さ 1 の配列を返す', async () => {
      const result = await highlighter.highlightFile('const a = 1', 'typescript')
      expect(result).toStrictEqual([[{ content: 'const a = 1', color: null }]])
    })

    it('改行 3 行 (末尾改行なし) を渡すと長さ 3 の配列を返す', async () => {
      const result = await highlighter.highlightFile('a\nb\nc', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [{ content: 'b', color: null }],
        [{ content: 'c', color: null }],
      ])
    })

    it('改行 3 行 (末尾改行あり) を渡すと末尾空行を含む長さ 4 の配列を返す', async () => {
      const result = await highlighter.highlightFile('a\nb\nc\n', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [{ content: 'b', color: null }],
        [{ content: 'c', color: null }],
        [],
      ])
    })

    it('途中の空行は長さ 0 の配列として扱う', async () => {
      const result = await highlighter.highlightFile('a\n\nb', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [],
        [{ content: 'b', color: null }],
      ])
    })

    it('連続する末尾改行は複数の空行として表現される', async () => {
      const result = await highlighter.highlightFile('a\nb\n\n', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [{ content: 'b', color: null }],
        [],
        [],
      ])
    })

    it('すべてのトークンの color は null である', async () => {
      const result = await highlighter.highlightFile('foo bar\nbaz', 'typescript')
      expect(result).not.toBeNull()
      for (const line of result ?? []) {
        for (const token of line) {
          expect(token.color).toBeNull()
        }
      }
    })
  })
})
