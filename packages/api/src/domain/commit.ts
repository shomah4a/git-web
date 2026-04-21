/**
 * コミット履歴のドメインモデル (ADR 0046)。
 *
 * git log の結果を表現する。
 */

/**
 * コミットごとの差分統計。
 */
export type CommitStats = {
  readonly filesChanged: number
  readonly insertions: number
  readonly deletions: number
}

/**
 * コミット履歴の 1 エントリ。
 */
export type CommitEntry = {
  readonly hash: string
  readonly authorName: string
  readonly authorEmail: string
  readonly date: string
  readonly subject: string
  readonly body: string
  readonly stats: CommitStats
}
