/**
 * コミット履歴の git 操作を提供する port (ADR 0046)。
 *
 * 設計方針:
 * - 既存の GitClient / GitDiffClient / GitRefsClient / GitTreeClient と同様に
 *   独立 port として定義する
 * - 実装は adapter/git/cli-client.ts の CliGitClient が implements する
 * - service 層は本 port に依存し、git コマンドの引数形式を知らない
 */

import type { CommitEntry } from '../commit.js'
import type { Revision } from '../revision.js'

export type LogQuery = {
  /** 起点リビジョン。 */
  readonly rev: Revision
  /** 取得件数上限。 */
  readonly limit: number
  /** このコミット SHA の次から取得する (カーソル)。 */
  readonly after: string | null
  /** パス絞り込み。 */
  readonly path: string | null
}

export type LogResult = {
  readonly commits: ReadonlyArray<CommitEntry>
  /** after カーソル以降にまだコミットがあるかどうか。 */
  readonly hasMore: boolean
}

export interface GitLogClient {
  /**
   * コミット履歴を取得する。
   *
   * limit + 1 件を内部で要求し、超過分で hasMore を判定する。
   */
  log(query: LogQuery): Promise<LogResult>
}
