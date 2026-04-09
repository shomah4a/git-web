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
 * - 末尾改行の扱い: Shiki の `codeToTokens` に揃え、trailing LF
 *   による「空の最終行」を含めない (ADR 0017 / 計画書 step 4-3 で確認予定)
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
 * - 改行コードは `\n` を基準に分割する (CRLF は `\r` を残したままトークン化される)
 * - 末尾改行があった場合、分解後末尾に現れる空文字 1 要素は除去する
 *   (Shiki の `codeToTokens` が trailing newline を末尾空行として含めない挙動に合わせる)
 * - 空文字入力は空配列
 */
function toPlainLines(content: string): HighlightedLines {
  if (content === '') {
    return []
  }
  const rawLines = content.split('\n')
  const lines = rawLines[rawLines.length - 1] === '' ? rawLines.slice(0, -1) : rawLines
  return lines.map((line) => [{ content: line, color: null }])
}
