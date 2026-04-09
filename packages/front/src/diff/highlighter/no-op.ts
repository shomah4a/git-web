/**
 * ハイライトを行わない no-op Highlighter (ADR 0017)。
 *
 * 用途:
 * - DiffView のテストで Shiki 本体 (wasm) を vitest に持ち込まないため
 * - Shiki の初期化前 / 失敗時の inject default として
 *
 * 実装方針:
 * - `highlightFile` は content を行に分解し、各行を単一トークン
 *   `[{ content: line, color: null }]` として返す
 * - 失敗しない。常に成功パスで resolve
 * - 末尾改行の扱い: Shiki の `codeToTokens` に揃える。Shiki は末尾 LF で
 *   空の末尾行を含め、空文字入力でも `[[]]` (長さ 1 の空行) を返すことが
 *   計画書 step 4-3 の cross-check で判明した。no-op もそれに合わせる
 */

import type { HighlightedLines, Highlighter } from './types.js'

export function createNoOpHighlighter(): Highlighter {
  // lang パラメータは Highlighter 型のシグネチャ上は存在するが、
  // 実装側では使わないため引数を省略する (TypeScript の関数 contravariance で許容)。
  return {
    preload() {
      return Promise.resolve()
    },
    highlightFile(content) {
      return Promise.resolve(toPlainLines(content))
    },
  }
}

/**
 * content を行配列に分解し、各行を単一トークンに包んで返す。
 *
 * Shiki の `codeToTokens` の行数に揃えるため、以下の仕様:
 * - 改行コードは `\n` を基準に分割する (CRLF は `\r` を残したままトークン化される)
 * - 空行は長さ 0 の配列 (`[]`) で表現する
 * - 空文字入力は `[[]]` (長さ 1 の空行)
 * - 末尾改行があれば末尾に空行を含める (`"a\n" → [[{a}], []]`)
 */
function toPlainLines(content: string): HighlightedLines {
  return content.split('\n').map((line) => (line === '' ? [] : [{ content: line, color: null }]))
}
