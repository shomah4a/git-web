/**
 * レビューコメントの行翻訳 (Tier1, ADR 0060)。
 *
 * コメントは commentSHA の new 側行番号でアンカーされる。表示中の diff の `to`
 * が commentSHA と異なる場合、`git diff <commentSHA>..<to>` の hunk を走査して、
 * commentSHA 側 (= old 側) の行番号を to 側 (= new 側) の行番号へ翻訳する。
 *
 * - 対象行が to で削除されていれば outdated
 * - hunk 群は old 側の昇順に並んでいる前提 (git diff の出力順)
 * - pair-lines.ts / expand-context.ts と同じ「hunk を純粋に走査する」書き味
 */

import type { DiffHunkDto } from '@git-web/common'

export type TranslateResult =
  | { readonly kind: 'mapped'; readonly line: number }
  | { readonly kind: 'outdated' }

/**
 * commentSHA 側の new 行番号 `oldLine` を、commentSHA..to の diff hunk を使って
 * to 側の行番号へ翻訳する。
 */
export function translateNewLine(
  oldLine: number,
  hunks: ReadonlyArray<DiffHunkDto>,
): TranslateResult {
  let delta = 0
  for (const hunk of hunks) {
    const hunkOldEnd = hunk.oldStart + hunk.oldLines - 1
    if (oldLine < hunk.oldStart) {
      // この hunk より前の無変更領域。これまでの delta を加算するだけ。
      return { kind: 'mapped', line: oldLine + delta }
    }
    if (oldLine <= hunkOldEnd) {
      return translateInsideHunk(oldLine, hunk)
    }
    // この hunk より後ろ。hunk による行数差を delta に蓄積して次へ。
    delta += hunk.newLines - hunk.oldLines
  }
  // 全 hunk より後ろの無変更領域。
  return { kind: 'mapped', line: oldLine + delta }
}

/**
 * hunk 内部の行対応を走査して翻訳する。
 * context 行はそのまま対応、delete 行 (old のみ) は outdated。
 */
function translateInsideHunk(oldLine: number, hunk: DiffHunkDto): TranslateResult {
  let oldCursor = hunk.oldStart
  let newCursor = hunk.newStart
  for (const line of hunk.lines) {
    if (line.kind === 'context') {
      if (oldCursor === oldLine) {
        return { kind: 'mapped', line: newCursor }
      }
      oldCursor++
      newCursor++
    } else if (line.kind === 'delete') {
      if (oldCursor === oldLine) {
        return { kind: 'outdated' }
      }
      oldCursor++
    } else {
      // add 行は old 側を進めない
      newCursor++
    }
  }
  // hunk 範囲内と判定されたのにヒットしないのは想定外。安全側で outdated。
  return { kind: 'outdated' }
}

/**
 * 行範囲 (start..end) を翻訳する。start が outdated なら範囲全体を outdated と扱う。
 * mapped の場合は翻訳後の start/end を返す (end は個別翻訳、outdated なら start に丸める)。
 *
 * 不変条件: translateNewLine は入力行に対し単調非減少なので、start <= end の入力に
 * 対し翻訳後も start <= end が保たれる (この性質に依存して end < start を防いでいる)。
 */
export function translateRange(
  start: number,
  end: number,
  hunks: ReadonlyArray<DiffHunkDto>,
):
  | { readonly kind: 'mapped'; readonly start: number; readonly end: number }
  | { readonly kind: 'outdated' } {
  const mappedStart = translateNewLine(start, hunks)
  if (mappedStart.kind === 'outdated') {
    return { kind: 'outdated' }
  }
  const mappedEnd = translateNewLine(end, hunks)
  const endLine = mappedEnd.kind === 'mapped' ? mappedEnd.line : mappedStart.line
  return { kind: 'mapped', start: mappedStart.line, end: endLine }
}
