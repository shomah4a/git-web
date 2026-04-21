/**
 * コミット履歴のユースケース層 (ADR 0046)。
 *
 * 設計方針 (ADR 0011):
 * - GitLogClient port に依存し、git コマンドの詳細を知らない
 * - HTTP / DTO には依存しない
 */

import type { GitLogClient, LogQuery, LogResult } from '../domain/ports/git-log-client.js'

export type CommitsService = {
  /**
   * コミット履歴��取得する。
   */
  getCommits(query: LogQuery): Promise<LogResult>
}

export function createCommitsService(gitLog: GitLogClient): CommitsService {
  return {
    async getCommits(query) {
      return gitLog.log(query)
    },
  }
}
