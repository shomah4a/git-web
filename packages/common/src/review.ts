/**
 * レビューコメント (ADR 0057) の front ↔ api wire format (DTO)。
 *
 * 設計方針 (ADR 0011):
 * - api 内部のドメインモデル (packages/api/src/domain/review.ts) とは別定義
 * - ファイル上の JSONL スキーマとも別物 (永続化形式の変更が wire を壊さない)
 * - 行範囲は new 側のみ (1-based, inclusive)
 */

export type ReviewCommentDto = {
  readonly id: string
  /** アンカーの 40 桁 commit SHA */
  readonly sha: string
  readonly path: string
  readonly newLineStart: number
  readonly newLineEnd: number
  readonly body: string
  /** ISO 8601 UTC */
  readonly createdAt: string
  readonly resolved: boolean
}

/**
 * GET /api/reviews のレスポンス DTO。
 * sha は要求 rev を解決した 40 桁 commit SHA。
 */
export type ReviewListResponseDto = {
  readonly sha: string
  readonly comments: ReadonlyArray<ReviewCommentDto>
}

/**
 * GET /api/reviews/commits のレスポンス DTO (ADR 0060 E2)。
 * from..to の範囲に含まれ、コメントを持つ commit SHA 一覧 (to 自身を含む)。
 */
export type ReviewCommitsResponseDto = {
  readonly shas: ReadonlyArray<string>
}
