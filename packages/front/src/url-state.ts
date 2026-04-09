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
 *
 * 前処理:
 * - `URLSearchParams` は application/x-www-form-urlencoded 仕様で `+` を
 *   半角スペースにデコードするが、git の ref 名には `+` が合法なので
 *   化けないように事前に `%2B` に置換する (LOW-1 対応)。
 *
 * 正規化:
 * - `from === WORKTREE_SENTINEL` は UI 契約上起きないが、URL 手入力経由で
 *   混入したケースでは DEFAULT_FROM に倒して表示と fetch の乖離を防ぐ
 *   (LOW-2 対応)
 */
export function readDiffRangeFromSearch(search: string): DiffRangeUrlState {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const safe = raw.replace(/\+/g, '%2B')
  const params = new URLSearchParams(safe)
  const fromRaw = params.get('from')
  const toRaw = params.get('to')
  const from = fromRaw !== null && fromRaw !== '' ? fromRaw : DEFAULT_FROM
  const to = toRaw !== null && toRaw !== '' ? toRaw : DEFAULT_TO
  return {
    from: from === WORKTREE_SENTINEL ? DEFAULT_FROM : from,
    to,
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
 * `pushDiffRangeToUrl` が必要とする History の最小部分型 (ADR 0020)。
 *
 * プロジェクトのコーディング規約で型アサーションを禁じているため、`History`
 * 全体ではなく構造的 narrow 型として定義する。`window.history` はこの型と
 * 構造的に互換なので DiffView からはそのまま渡せる。テストでは手書きの
 * 単純オブジェクトで代用できる。
 */
export type HistoryPusher = {
  pushState(state: unknown, title: string, url: string): void
}

/**
 * `pushDiffRangeToUrl` が必要とする Location の最小部分型 (ADR 0020)。
 * 理由は `HistoryPusher` と同じ。
 */
export type LocationView = {
  readonly pathname: string
  readonly search: string
  readonly hash: string
}

/**
 * 現在の URL と比較して差分があるときのみ `history.pushState` する。
 *
 * - 同一 range の連続書き込みで履歴が膨らむのを防ぐ
 * - URL の path 部分は維持する (query だけ置き換える)
 * - state オブジェクトは空 (本アプリは state を使わず URL のみを真とする)
 */
export function pushDiffRangeToUrl(
  history: HistoryPusher,
  location: LocationView,
  range: DiffRangeUrlState,
): void {
  const nextSearch = buildDiffRangeSearch(range)
  if (nextSearch === location.search) return
  const nextUrl = `${location.pathname}${nextSearch}${location.hash}`
  history.pushState({}, '', nextUrl)
}
