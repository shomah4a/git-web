/**
 * テスト用のフェイク Highlighter (ADR 0017 / 計画書 step 9)。
 *
 * - `createFakeHighlighter(linesByLang)`: lang ごとに固定のトークン列を返す。
 *   簡易な「色付き描画」の検証用
 * - `createDeferredFakeHighlighter()`: highlightFile の解決を外部から
 *   手動で制御できる。generation race の決定論的なテストに使う
 */

import type { HighlightedLines, Highlighter } from '../diff/highlighter/types.js'

/**
 * 言語ごとにあらかじめ用意したトークン列を返すフェイク。
 *
 * 指定されていない言語は null (プレーン fallback) を返す。
 */
export function createFakeHighlighter(
  linesByLang: ReadonlyMap<string, HighlightedLines>,
): Highlighter {
  return {
    preload() {
      return Promise.resolve()
    },
    highlightFile(_content, lang) {
      const lines = linesByLang.get(lang)
      return Promise.resolve(lines ?? null)
    },
  }
}

/**
 * `highlightFile` の解決を外部から制御できるフェイク。
 *
 * - `highlighter` を DI 注入する
 * - デフォルトでは全ての `highlightFile` 呼び出しが pending のまま
 * - `resolveAll(result)` で、現在 pending な呼び出しを一括解決する
 * - `setImmediateResult(result)` を呼ぶと、それ以降の新規 `highlightFile`
 *   呼び出しは即座に `result` で解決する。race テストで 1 回目と 2 回目の
 *   呼び出しを区別するために使う
 */
export function createDeferredFakeHighlighter(): {
  highlighter: Highlighter
  pendingCount(): number
  resolveAll(result: HighlightedLines | null): void
  setImmediateResult(result: HighlightedLines | null): void
} {
  type Pending = { resolve: (value: HighlightedLines | null) => void }
  const pending: Pending[] = []
  // pending モード = null 以外の 'pending' シンボル相当を保持するため
  // boolean フラグと値を分ける
  let immediateMode = false
  let immediateResult: HighlightedLines | null = null
  const highlighter: Highlighter = {
    preload() {
      return Promise.resolve()
    },
    highlightFile() {
      if (immediateMode) {
        return Promise.resolve(immediateResult)
      }
      return new Promise<HighlightedLines | null>((resolve) => {
        pending.push({ resolve })
      })
    },
  }
  return {
    highlighter,
    pendingCount() {
      return pending.length
    },
    resolveAll(result) {
      const snapshot = pending.splice(0, pending.length)
      for (const p of snapshot) {
        p.resolve(result)
      }
    },
    setImmediateResult(result) {
      immediateMode = true
      immediateResult = result
    },
  }
}
