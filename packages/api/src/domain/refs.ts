/**
 * ref 一覧のドメインモデル。
 *
 * 設計方針 (ADR 0018):
 * - head は空リポジトリ (unborn HEAD) / detached HEAD のとき null
 * - branches / tags は `git for-each-ref --format='%(refname:short)'` の
 *   出力を Node 側でフィルタした結果
 * - truncated はサーバ側のハード上限で切り詰められたかどうか
 *
 * common パッケージの RefListDto と同型だが、ADR 0011 の方針に従い
 * ドメイン層と wire format の型は分離する。
 */
export type RefList = {
  readonly head: string | null
  readonly branches: readonly string[]
  readonly tags: readonly string[]
  readonly truncated: boolean
}

/**
 * /api/refs のクエリパラメータを表すドメイン型。
 *
 * parseRefsQuery を通過した値のみが入る。
 */
export type RefsQuery = {
  readonly q: string
  readonly limit: number
}
