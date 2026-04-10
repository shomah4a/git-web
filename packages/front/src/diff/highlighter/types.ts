/**
 * 構文ハイライトの port 型定義 (ADR 0017)。
 *
 * DiffView は Shiki に直接依存せず、本ファイルの Highlighter インターフェイス
 * 経由でハイライト結果を受け取る。テスト側は no-op / fake を注入できる。
 */

import type { InjectionKey } from 'vue'

/**
 * ハイライトされたトークン 1 つ。
 *
 * - `content`: トークンの文字列 (空白含む、エスケープ前の生テキスト)
 * - `color`: ライトテーマでの前景色。6 または 8 桁 hex 文字列。プレーンは null
 * - `colorDark`: ダークテーマでの前景色。省略時 / null はプレーン扱い
 *
 * Shiki 側の ThemedToken には bgColor / fontStyle / htmlStyle 等があるが、
 * 本プロジェクトでは前景色のみ使う。背景色は diff の add / delete ハイライト
 * (.cell-add / .cell-delete) と衝突するため無視する (ADR 0017)。
 *
 * ADR 0021 でマルチテーマ化した際、既存テスト fixture を壊さないため
 * `color` をライト側の従来フィールドとして温存し、`colorDark` を optional
 * で追加する後方互換拡張を採った。
 */
export type HighlightedToken = {
  readonly content: string
  readonly color: string | null
  readonly colorDark?: string | null
}

/**
 * ファイル全体を行単位のトークン列に分割したもの。
 *
 * - 第 1 次元 = 行 index (0 始まり、DiffLine.oldLineNo / newLineNo - 1 に対応)
 * - 第 2 次元 = 各行内のトークン列
 * - 空行は長さ 0 の内部配列
 */
export type HighlightedLines = ReadonlyArray<ReadonlyArray<HighlightedToken>>

/**
 * 構文ハイライト実装の port。
 *
 * 実装は Shiki 版 (本番) と no-op 版 (テスト) の 2 種類を提供する。
 * いかなる失敗も呼び出し側に例外を投げず、null / 空結果で fallback させる。
 */
export type Highlighter = {
  /**
   * 指定言語の grammar / theme を事前ロードする。
   *
   * - 同一 lang の重複呼び出しはメモ化
   * - 未対応言語 / ロード失敗は silent (resolve する) でプレーン fallback に倒す
   */
  preload(lang: string): Promise<void>
  /**
   * ファイル全体を行単位のトークン列に変換する。
   *
   * - 成功時: 行配列を返す
   * - 失敗時 (例外 / 未対応言語 / 内部エラー): null を返す (呼び出し側でプレーン fallback)
   */
  highlightFile(content: string, lang: string): Promise<HighlightedLines | null>
}

/**
 * Vue の provide / inject 用 InjectionKey。
 *
 * 文字列キーは型安全性が落ちるため使わない (ADR 0010)。
 * main.ts と DiffView.vue (およびテストヘルパ) で本キーを共有する。
 */
export const highlighterKey: InjectionKey<Highlighter> = Symbol('highlighter')
