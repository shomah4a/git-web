/**
 * ツリー表示のユースケース層 (ADR 0022)。
 *
 * 設計方針 (ADR 0011):
 * - rev が指定されたら GitTreeClient (git ls-tree) を使う
 * - rev が null (worktree) なら git ls-files + git status を使う
 * - HTTP / DTO には依存しない
 */

import type { GitTreeClient } from '../domain/ports/git-tree-client.js'
import type { Revision } from '../domain/revision.js'
import type { TreeEntry } from '../domain/tree.js'

/**
 * worktree のツリー取得を行う port。
 * CliGitClient の listWorktreeTree を注入する。
 */
export type WorktreeTreeLister = {
  listWorktreeTree(path: string): Promise<ReadonlyArray<TreeEntry>>
}

export type TreeService = {
  /**
   * 指定リビジョン・パス配下のツリーエントリ一覧を返す。
   *
   * @param rev 対象リビジョン。null の場合は worktree
   * @param path リポジトリルートからの相対パス (空文字 = ルート)
   */
  getTree(rev: Revision | null, path: string): Promise<ReadonlyArray<TreeEntry>>
}

export function createTreeService(
  gitTree: GitTreeClient,
  worktreeTree: WorktreeTreeLister,
): TreeService {
  return {
    async getTree(rev, path) {
      if (rev === null) {
        return worktreeTree.listWorktreeTree(path)
      }
      return gitTree.listTree(rev, path)
    },
  }
}
