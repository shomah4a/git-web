/**
 * ツリービューのファイル単位最終コミット取得ユースケース (ADR 0054 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - tree 取得は既存 TreeService を再利用して targetNames を確定する
 * - rev=null (worktree) のときは内部的に HEAD を rev として log を呼ぶ
 * - HEAD が解決できない (空リポ等) 場合は全エントリ null を返す
 * - HTTP / DTO には依存しない
 * - wt 切替対応 (ADR 0055): クライアント群はリクエストごとに controller が
 *   bind した状態で渡される。本サービスは bind 済みの clients を引数で受ける
 */

import type { GitClient } from '../domain/ports/git-client.js'
import type {
  GitTreeCommitsClient,
  LastCommitInfo,
} from '../domain/ports/git-tree-commits-client.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import type { TreeService } from './tree-service.js'

/**
 * git log 走査の上限件数。
 *
 * ADR 0054 §2: 初期値 1000 とし、運用で見直す。
 * 大半のディレクトリは 1000 件以下の履歴で targetNames を確定できる。
 * 到達時の未確定エントリは null となるため、UI 上は `—` 表示される。
 */
const TREE_COMMITS_MAX_COUNT = 1000

/**
 * 1 エントリ分の結果。
 *
 * - name: ディレクトリ直下のエントリ名
 * - lastCommit: 履歴未確定の場合は null
 */
export type TreeCommitResult = {
  readonly name: string
  readonly lastCommit: LastCommitInfo | null
}

/**
 * tree-commits-service が利用する、リクエストごとの worktree-bind 済み clients。
 */
export type TreeCommitsClients = {
  readonly gitClient: GitClient
  readonly treeCommitsClient: GitTreeCommitsClient
}

export type TreeCommitsService = {
  /**
   * 指定リビジョン・パス配下のエントリ各々について最終コミット情報を返す。
   *
   * - rev=null (worktree) は内部的に HEAD を rev として扱う
   * - HEAD 未解決時は全エントリ null
   */
  getTreeCommits(
    clients: TreeCommitsClients,
    treeService: TreeService,
    rev: Revision | null,
    path: string,
  ): Promise<ReadonlyArray<TreeCommitResult>>
}

export function createTreeCommitsService(): TreeCommitsService {
  return {
    async getTreeCommits(clients, treeService, rev, path) {
      const entries = await treeService.getTree(rev, path)
      if (entries.length === 0) {
        return []
      }

      const targetNames = new Set(entries.map((e) => e.name))
      const effectiveRev = rev ?? (await resolveHeadRevision(clients.gitClient))

      if (effectiveRev === null) {
        return entries.map((e) => ({ name: e.name, lastCommit: null }))
      }

      const commitsByName = await clients.treeCommitsClient.lastCommitsByName(
        effectiveRev,
        normalizeDir(path),
        targetNames,
        TREE_COMMITS_MAX_COUNT,
      )

      return entries.map((e) => ({
        name: e.name,
        lastCommit: commitsByName.get(e.name) ?? null,
      }))
    },
  }
}

/**
 * HEAD を Revision として解決する。
 *
 * 空リポなどで HEAD が解決できない場合は null を返す (ADR 0054 §6)。
 */
async function resolveHeadRevision(gitClient: GitClient): Promise<Revision | null> {
  try {
    await gitClient.head()
  } catch {
    return null
  }
  return parseRevision('HEAD')
}

/**
 * port に渡すディレクトリパスを正規化する。
 *
 * ADR 0054 §1 / 防衛的計画評価 M5:
 * - 非ルートは必ず末尾 `/` を付ける (パス境界の明確化、ファイル誤指定の暴発回避)
 * - ルート ('') はそのまま
 *
 * port 実装側で再正規化を必須にしないため、service 層で揃える。
 */
function normalizeDir(path: string): string {
  if (path === '') return ''
  return path.endsWith('/') ? path : `${path}/`
}
