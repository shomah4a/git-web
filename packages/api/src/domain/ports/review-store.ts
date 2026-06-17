/**
 * レビューコメントの永続化 port (ADR 0058)。
 *
 * 設計方針 (ADR 0011 / ADR 0058):
 * - コメント本体は append-only。resolved は別ファイルの append-only イベント
 * - 引数 / 戻り値は domain 型のみ。ファイル形式 (JSONL) は adapter に閉じる
 * - resolved の畳み込み (foldResolved) は service 側で行うため、本 port は
 *   生のイベント列を返すだけにする
 */

import type { ResolvedEvent, ReviewComment, ReviewSha } from '../review.js'

export interface ReviewStore {
  /** 指定コミットのコメント本体一覧。未存在なら空配列。 */
  listComments(this: void, sha: ReviewSha): Promise<ReadonlyArray<ReviewComment>>
  /** コメント 1 件を追記する。 */
  appendComment(this: void, comment: ReviewComment): Promise<void>
  /** 指定コミットの resolved イベント一覧 (append 順)。未存在なら空配列。 */
  listResolvedEvents(this: void, sha: ReviewSha): Promise<ReadonlyArray<ResolvedEvent>>
  /** resolved イベント 1 件を追記する。 */
  appendResolvedEvent(this: void, sha: ReviewSha, event: ResolvedEvent): Promise<void>
  /**
   * コメント本体ファイルが存在する commit SHA 一覧を返す (ADR 0060 E2)。
   * reviewsDir 未存在なら空配列。
   */
  listCommitShasWithComments(this: void): Promise<ReadonlyArray<string>>
}
