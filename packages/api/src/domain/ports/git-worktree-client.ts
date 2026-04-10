/**
 * worktree エントリ取得の port (ADR 0023)。
 *
 * - 実装は adapter 層 (adapter/git/cli-client.ts) に置く
 * - service は本 interface のみに依存する
 */

import type { WorktreeEntry } from '../worktree-entry.js'

export interface GitWorktreeClient {
  /**
   * worktree の指定パス配下 1 階層分のエントリを返す。
   *
   * mode, size, status を含むメタデータ付きエントリを返す。
   *
   * @param path リポジトリルートからの相対パス (空文字 = ルート)
   */
  listWorktreeEntries(path: string): Promise<ReadonlyArray<WorktreeEntry>>
}
