/**
 * ref 一覧のドメインモデル (ADR 0018, ADR 0032)。
 *
 * - branches / tags は `git for-each-ref --format='%(refname:short)'` の
 *   出力を Node 側でフィルタした全件
 *
 * common パッケージの RefListDto と同型だが、ADR 0011 の方針に従い
 * ドメイン層と wire format の型は分離する。
 */
export type RefList = {
  readonly defaultBranch: string | null
  readonly branches: readonly string[]
  readonly tags: readonly string[]
}

/**
 * /api/refs のクエリパラメータを表すドメイン型。
 *
 * parseRefsQuery を通過した値のみが入る。
 * ADR 0032: limit は撤廃。
 */
export type RefsQuery = {
  readonly q: string
}
