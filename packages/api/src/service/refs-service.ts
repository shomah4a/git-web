/**
 * ref 一覧のユースケース層 (ADR 0018, ADR 0032)。
 *
 * 設計方針 (ADR 0011):
 * - 依存は GitRefsClient port のみ
 * - フィルタ (q) は本層で実装する。adapter 層は全件取得のみ行う
 * - ADR 0032: 件数制限 (limit) は撤廃。ブランチ・タグは全件返す
 * - HTTP / DTO / URL には依存しない
 */

import type { GitRefsClient } from '../domain/ports/git-refs-client.js'
import type { RefList, RefsQuery } from '../domain/refs.js'

export type RefsService = {
  list(query: RefsQuery): Promise<RefList>
}

const DEFAULT_BRANCH_CANDIDATES = ['main', 'master'] as const

function findDefaultBranch(branches: ReadonlyArray<string>): string | null {
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (branches.includes(candidate)) {
      return candidate
    }
  }
  return null
}

export function createRefsService(git: GitRefsClient): RefsService {
  return {
    async list(query) {
      const [branchesAll, tagsAll] = await Promise.all([git.listBranches(), git.listTags()])

      const needle = query.q.toLowerCase()
      const matches = (name: string): boolean =>
        needle.length === 0 || name.toLowerCase().includes(needle)

      const branches = branchesAll.filter(matches)
      const tags = tagsAll.filter(matches)

      // ADR 0025: 全件から main → master の順で探す
      const defaultBranch = findDefaultBranch(branchesAll)

      return {
        defaultBranch,
        branches,
        tags,
      }
    },
  }
}
