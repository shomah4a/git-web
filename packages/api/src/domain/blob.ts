/**
 * blob (ファイル内容) ドメイン型。
 *
 * 設計方針 (ADR 0016):
 * - /api/blob エンドポイントのドメインモデル
 * - rev: null は worktree 由来を意味する
 * - binary 時は content が空文字
 * - language は path からの推定結果 (domain/language.ts の inferLanguage)
 */

import type { Revision } from './revision.js'

export type Blob = {
  readonly path: string
  readonly rev: Revision | null
  readonly content: string
  readonly binary: boolean
  readonly language: string | null
}
