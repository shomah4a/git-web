/**
 * worktree 表示のユースケース層 (ADR 0023)。
 *
 * 設計方針 (ADR 0011):
 * - GitWorktreeClient port 経由で worktree エントリを取得する
 * - HTTP / DTO には依存しない
 */

import type { GitWorktreeClient } from '../domain/ports/git-worktree-client.js'
import type { WorktreeEntry } from '../domain/worktree-entry.js'

export type WorktreeService = {
  getWorktreeEntries(path: string): Promise<ReadonlyArray<WorktreeEntry>>
}

export function createWorktreeService(client: GitWorktreeClient): WorktreeService {
  return {
    async getWorktreeEntries(path) {
      return client.listWorktreeEntries(path)
    },
  }
}
