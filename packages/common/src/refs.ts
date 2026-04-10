/**
 * refs 一覧エンドポイントの DTO。
 *
 * 設計方針 (ADR 0018):
 * - GET /api/refs?q=<query>&limit=<n> のレスポンス型
 * - head は通常 `git symbolic-ref --short HEAD` の結果。
 *   空リポジトリ (unborn HEAD) や detached HEAD の場合は null
 * - head は q によるフィルタ対象外で常に実体を返す
 * - branches / tags はサーバ側で q による大小区別なし literal 部分一致フィルタを
 *   適用後、ブランチを先に詰め、残り枠でタグを詰める順序で limit 件まで切り詰める
 * - 切り詰めが発生した場合 truncated = true
 */
export type RefListDto = {
  readonly head: string | null
  readonly defaultBranch: string | null
  readonly branches: readonly string[]
  readonly tags: readonly string[]
  readonly truncated: boolean
}
