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
 * - テスト側で `resolveAll(result)` を呼ぶまで、すべての highlightFile
 *   呼び出しが pending のまま
 * - `resolveAll` は呼び出し時点で pending な全てを一括解決する
 */
export function createDeferredFakeHighlighter(): {
  highlighter: Highlighter
  pendingCount(): number
  resolveAll(result: HighlightedLines | null): void
} {
  type Pending = { resolve: (value: HighlightedLines | null) => void }
  const pending: Pending[] = []
  const highlighter: Highlighter = {
    preload() {
      return Promise.resolve()
    },
    highlightFile() {
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
  }
}
