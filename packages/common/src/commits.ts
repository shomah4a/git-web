/**
 * コミット履歴エンドポイントの DTO (ADR 0046)。
 *
 * 設計方針 (ADR 0011):
 * - front ↔ api の wire format のみを表現する
 * - api 内部の CommitEntry ドメインモデルとは型定義を別にする
 */

export type CommitStatsDto = {
  readonly filesChanged: number
  readonly insertions: number
  readonly deletions: number
}

export type CommitDto = {
  readonly hash: string
  readonly parentCount: number
  readonly authorName: string
  readonly authorEmail: string
  /** 著者日時 (UNIX epoch 秒)。 */
  readonly date: number
  readonly subject: string
  readonly body: string
  readonly stats: CommitStatsDto
}

export type CommitsResponseDto = {
  readonly commits: ReadonlyArray<CommitDto>
  readonly hasMore: boolean
}
