/**
 * worktree 表示のユースケース層 (ADR 0023 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - GitWorktreeClient port 経由で worktree エントリを取得する
 * - HTTP / DTO には依存しない
 * - wt 切替対応のため、リクエストごとに対象 worktree に bind した
 *   GitWorktreeClient を controller から渡してもらう
 *   (controller が resolver + factory 経由で構築する)
 */

import type { GitWorktreeClient } from '../domain/ports/git-worktree-client.js'
import type { WorktreeEntry } from '../domain/worktree-entry.js'

export type WorktreeService = {
  getWorktreeEntries(client: GitWorktreeClient, path: string): Promise<ReadonlyArray<WorktreeEntry>>
}

export function createWorktreeService(): WorktreeService {
  return {
    async getWorktreeEntries(client, path) {
      return client.listWorktreeEntries(path)
    },
  }
}
