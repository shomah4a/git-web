/**
 * diff の実行範囲を表す判別ユニオン。
 *
 * 設計方針 (ADR 0012):
 * - from / to クエリパラメータの 4 通りの組み合わせを型で表現する
 * - "to だけ指定" は InvalidDiffRangeError として弾く
 * - デフォルト (from / to なし) は working tree vs HEAD。実 CLI では
 *   `git diff HEAD` を呼ぶ (worktree vs index ではない)
 */

import { InvalidDiffRangeError } from './errors.js'
import type { Revision } from './revision.js'

export type DiffRange =
  | { readonly kind: 'working-vs-head' }
  | { readonly kind: 'working-vs-rev'; readonly from: Revision }
  | { readonly kind: 'rev-vs-rev'; readonly from: Revision; readonly to: Revision }

/**
 * from / to Revision から DiffRange を構築する。
 *
 * 組み合わせ:
 * - from undefined, to undefined → working-vs-head
 * - from あり, to undefined     → working-vs-rev
 * - from あり, to あり           → rev-vs-rev
 * - from undefined, to あり     → InvalidDiffRangeError
 *
 * from / to そのものの形式バリデーションは呼び出し側で parseRevision を
 * 通してから本関数に渡す。
 */
export function buildDiffRange(from: Revision | undefined, to: Revision | undefined): DiffRange {
  if (from === undefined && to === undefined) {
    return { kind: 'working-vs-head' }
  }
  if (from !== undefined && to === undefined) {
    return { kind: 'working-vs-rev', from }
  }
  if (from !== undefined && to !== undefined) {
    return { kind: 'rev-vs-rev', from, to }
  }
  throw new InvalidDiffRangeError('to specified without from')
}
