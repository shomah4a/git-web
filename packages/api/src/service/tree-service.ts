/**
 * ツリー表示のユースケース層 (ADR 0022)。
 *
 * 設計方針 (ADR 0011):
 * - rev が指定されたら GitTreeClient (git ls-tree) を使う
 * - rev が null (worktree) なら WorktreeTreeReader (readdir) を使う
 * - HTTP / DTO には依存しない
 */

import type { GitTreeClient } from '../domain/ports/git-tree-client.js'
import type { Revision } from '../domain/revision.js'
import type { TreeEntry } from '../domain/tree.js'
import type { WorktreeTreeReader } from '../adapter/fs/worktree-tree-reader.js'

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
  worktreeReader: WorktreeTreeReader,
): TreeService {
  return {
    async getTree(rev, path) {
      if (rev === null) {
        return worktreeReader.list(path)
      }
      return gitTree.listTree(rev, path)
    },
  }
}
