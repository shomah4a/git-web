/**
 * diff ビューの from/to と URL query の同期に使う純粋関数群 (ADR 0020)。
 *
 * 設計方針:
 * - `window.history` / `window.location` への副作用は本モジュールだけに集約し、
 *   呼び出し側 (DiffView.vue) には History / Location を引数で渡してもらう
 *   形にする (ルール 070 副作用の外部化)
 * - 読み書きはデフォルト値 (`from=HEAD`, `to=(worktree)`) を暗黙にキー省略し、
 *   ADR 0019 の既存挙動 (空クエリ = worktree vs HEAD) と完全互換に保つ
 */

/**
 * UI 仮想 ref 文字列。`DiffView.vue` の `WORKTREE_SENTINEL` と同一値。
 * 両者を同一定数にしたいが、import 循環を避けるためここでも定義する。
 * 値が乖離しないよう unit test で突き合わせる。
 */
export const WORKTREE_SENTINEL = '(worktree)' as const

/**
 * from/to のデフォルト値。ADR 0019 の初期状態と一致させる。
 */
export const DEFAULT_FROM = 'HEAD' as const
export const DEFAULT_TO = WORKTREE_SENTINEL

export type DiffRangeUrlState = {
  readonly from: string
  readonly to: string
}

/**
 * URL search 文字列 (先頭 '?' 有無どちらでも可) から range を復元する。
 * キーが無い / 空文字のときはデフォルト値に倒す。
 */
export function readDiffRangeFromSearch(search: string): DiffRangeUrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const from = params.get('from')
  const to = params.get('to')
  return {
    from: from !== null && from !== '' ? from : DEFAULT_FROM,
    to: to !== null && to !== '' ? to : DEFAULT_TO,
  }
}

/**
 * range を URL search 文字列 (先頭 '?' 込み、デフォルト状態なら空文字) に変換する。
 * デフォルト値はキー省略する。URLSearchParams がエンコードを担う。
 */
export function buildDiffRangeSearch(range: DiffRangeUrlState): string {
  const params = new URLSearchParams()
  if (range.from !== DEFAULT_FROM) {
    params.set('from', range.from)
  }
  if (range.to !== DEFAULT_TO) {
    params.set('to', range.to)
  }
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * 現在の URL と比較して差分があるときのみ `history.pushState` する。
 *
 * - 同一 range の連続書き込みで履歴が膨らむのを防ぐ
 * - URL の path 部分は維持する (query だけ置き換える)
 * - state オブジェクトは空 (本アプリは state を使わず URL のみを真とする)
 */
export function pushDiffRangeToUrl(
  history: History,
  location: Location,
  range: DiffRangeUrlState,
): void {
  const nextSearch = buildDiffRangeSearch(range)
  if (nextSearch === location.search) return
  const nextUrl = `${location.pathname}${nextSearch}${location.hash}`
  history.pushState({}, '', nextUrl)
}
