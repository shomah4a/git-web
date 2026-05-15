/**
 * git worktree 一覧取得の port (ADR 0055)。
 *
 * - 実装は adapter/git/worktree-list-client.ts
 * - service / resolver は本 interface のみに依存する
 */

import type { WorktreeInfo } from '../worktree-info.js'

export interface GitWorktreeListClient {
  /**
   * `git worktree list --porcelain` の結果をパースして返す。
   *
   * - bare / submodule の除外は service 層で行う (本 port は git の生情報を返す)
   * - 順序は git の出力順 (= main が先頭、その後 add 順)
   */
  listWorktrees(): Promise<ReadonlyArray<WorktreeInfo>>
}
