/**
 * diff view のコンテキスト展開ロジック (ADR 0050)。
 *
 * hunk 間のギャップを計算し、展開済み行数に基づいて表示すべき行範囲を
 * 算出する純粋関数群を提供する。pair-lines.ts と同じパターン。
 */

import type { DiffHunkDto } from '@git-web/common'

/**
 * ギャップの展開状態。
 *
 * - expandedDown: ギャップ上端から下方向に展開した行数
 * - expandedUp:   ギャップ下端から上方向に展開した行数
 */
export type GapExpansion = {
  readonly expandedDown: number
  readonly expandedUp: number
}

/**
 * ギャップの行範囲情報 (1-based, inclusive)。
 *
 * old 側と new 側で行数が異なる場合がある（hunk 内の追加・削除行数の差による）。
 */
export type GapInfo = {
  readonly oldFrom: number
  readonly oldTo: number
  readonly newFrom: number
  readonly newTo: number
}

/**
 * 展開によって表示すべき行範囲 (1-based, inclusive)。
 *
 * 上端側（down 方向）と下端側（up 方向）の 2 つの範囲を返す。
 * 重なりが生じた場合は全行を 1 つの範囲として down 側に統合し、
 * up 側は null にする。
 */
export type ExpandedRange = {
  readonly down: { readonly from: number; readonly to: number } | null
  readonly up: { readonly from: number; readonly to: number } | null
}

/**
 * 1 つのファイルの全 hunk からギャップ一覧を算出する。
 *
 * 戻り値のインデックス:
 * - 0: 先頭ギャップ（ファイル先頭 ~ hunks[0] の前）
 * - 1 ~ hunks.length - 1: hunk 間ギャップ（hunks[i-1] の後 ~ hunks[i] の前）
 * - hunks.length: 末尾ギャップ（最終 hunk の後 ~ ファイル末尾）
 *
 * ギャップが存在しない位置（行範囲が空）では null を返す。
 *
 * @param hunks - diff のhunk 列
 * @param oldTotalLines - old 側ファイルの総行数
 * @param newTotalLines - new 側ファイルの総行数
 */
export function computeGaps(
  hunks: ReadonlyArray<DiffHunkDto>,
  oldTotalLines: number,
  newTotalLines: number,
): ReadonlyArray<GapInfo | null> {
  if (hunks.length === 0) {
    return []
  }
  const result: Array<GapInfo | null> = []

  // 先頭ギャップ
  const firstHunk = hunks[0]
  if (firstHunk !== undefined) {
    result.push(buildGap(1, firstHunk.oldStart - 1, 1, firstHunk.newStart - 1))
  }

  // hunk 間ギャップ
  for (let i = 1; i < hunks.length; i++) {
    const prev = hunks[i - 1]
    const curr = hunks[i]
    if (prev === undefined || curr === undefined) {
      result.push(null)
      continue
    }
    const oldFrom = prev.oldStart + prev.oldLines
    const oldTo = curr.oldStart - 1
    const newFrom = prev.newStart + prev.newLines
    const newTo = curr.newStart - 1
    result.push(buildGap(oldFrom, oldTo, newFrom, newTo))
  }

  // 末尾ギャップ
  const lastHunk = hunks[hunks.length - 1]
  if (lastHunk !== undefined) {
    const oldFrom = lastHunk.oldStart + lastHunk.oldLines
    const newFrom = lastHunk.newStart + lastHunk.newLines
    result.push(buildGap(oldFrom, oldTotalLines, newFrom, newTotalLines))
  }

  return result
}

function buildGap(oldFrom: number, oldTo: number, newFrom: number, newTo: number): GapInfo | null {
  // old 側と new 側の両方とも行がなければギャップなし
  if (oldFrom > oldTo && newFrom > newTo) {
    return null
  }
  return { oldFrom, oldTo, newFrom, newTo }
}

/**
 * ギャップの old 側の行数を返す。
 */
export function gapOldTotal(gap: GapInfo): number {
  return Math.max(0, gap.oldTo - gap.oldFrom + 1)
}

/**
 * ギャップの new 側の行数を返す。
 */
export function gapNewTotal(gap: GapInfo): number {
  return Math.max(0, gap.newTo - gap.newFrom + 1)
}

/**
 * ギャップが完全に展開されているかを判定する。
 */
export function isGapFullyExpanded(gap: GapInfo, expansion: GapExpansion): boolean {
  const oldTotal = gapOldTotal(gap)
  const newTotal = gapNewTotal(gap)
  const total = Math.max(oldTotal, newTotal)
  return expansion.expandedDown + expansion.expandedUp >= total
}

/**
 * 展開状態に基づき、old 側で表示すべき行範囲を算出する。
 *
 * 展開行数が重なった場合（down + up >= total）は全行を down 側に統合する。
 */
export function computeExpandedRange(gap: GapInfo, expansion: GapExpansion): ExpandedRange {
  return computeExpandedRangeForSide(gap.oldFrom, gap.oldTo, expansion)
}

/**
 * 展開状態に基づき、new 側で表示すべき行範囲を算出する。
 */
export function computeExpandedRangeNew(gap: GapInfo, expansion: GapExpansion): ExpandedRange {
  return computeExpandedRangeForSide(gap.newFrom, gap.newTo, expansion)
}

function computeExpandedRangeForSide(
  from: number,
  to: number,
  expansion: GapExpansion,
): ExpandedRange {
  const total = Math.max(0, to - from + 1)
  if (total === 0) {
    return { down: null, up: null }
  }

  // 全行表示: 各方向が実際に占める範囲で分割する。
  // down のみなら全行を down に、up のみなら全行を up に入れる。
  // 両方ある場合は down の末尾と up の先頭が重ならないように境界を決める。
  if (expansion.expandedDown + expansion.expandedUp >= total) {
    if (expansion.expandedDown === 0) {
      return { down: null, up: { from, to } }
    }
    if (expansion.expandedUp === 0) {
      return { down: { from, to }, up: null }
    }
    const downTo = Math.min(from + expansion.expandedDown - 1, to)
    return { down: { from, to: downTo }, up: { from: downTo + 1, to } }
  }

  const downRange =
    expansion.expandedDown > 0
      ? { from, to: Math.min(from + expansion.expandedDown - 1, to) }
      : null

  const upRange =
    expansion.expandedUp > 0 ? { from: Math.max(to - expansion.expandedUp + 1, from), to } : null

  return { down: downRange, up: upRange }
}

/**
 * ギャップにまだ展開できる行が残っているかを判定する。
 *
 * @param direction - 'down' なら上端からの展開余地、'up' なら下端からの展開余地
 */
export function hasRemainingLines(
  gap: GapInfo,
  expansion: GapExpansion,
  direction: 'down' | 'up',
): boolean {
  const oldTotal = gapOldTotal(gap)
  const newTotal = gapNewTotal(gap)
  const total = Math.max(oldTotal, newTotal)
  if (expansion.expandedDown + expansion.expandedUp >= total) {
    return false
  }
  if (direction === 'down') {
    return expansion.expandedDown < total
  }
  return expansion.expandedUp < total
}
