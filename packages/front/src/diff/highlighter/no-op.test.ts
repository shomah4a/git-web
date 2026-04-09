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
    it('空文字を渡すと空配列を返す', async () => {
      const result = await highlighter.highlightFile('', 'typescript')
      expect(result).toStrictEqual([])
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

    it('改行 3 行 (末尾改行あり) を渡しても長さ 3 の配列を返す', async () => {
      const result = await highlighter.highlightFile('a\nb\nc\n', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [{ content: 'b', color: null }],
        [{ content: 'c', color: null }],
      ])
    })

    it('空行を含む入力を渡すと、空行はトークン content が空文字になる', async () => {
      const result = await highlighter.highlightFile('a\n\nb', 'typescript')
      expect(result).toStrictEqual([
        [{ content: 'a', color: null }],
        [{ content: '', color: null }],
        [{ content: 'b', color: null }],
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
