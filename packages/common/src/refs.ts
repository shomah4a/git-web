/**
 * refs 一覧エンドポイントの DTO (ADR 0018, ADR 0032)。
 *
 * - GET /api/refs?q=<query> のレスポンス型
 * - branches / tags はサーバ側で q による大小区別なし literal 部分一致フィルタを
 *   適用した全件を返す (ADR 0032: 件数制限撤廃)
 */
export type RefListDto = {
  readonly defaultBranch: string | null
  readonly branches: readonly string[]
  readonly tags: readonly string[]
}
