/**
 * ref 一覧のユースケース層 (ADR 0018)。
 *
 * 設計方針 (ADR 0011):
 * - 依存は GitRefsClient port のみ
 * - フィルタ (q) と切り詰め (limit) は本層で実装する。adapter 層は全件取得のみ
 *   行う
 * - HTTP / DTO / URL には依存しない
 */

import type { GitRefsClient } from '../domain/ports/git-refs-client.js'
import type { RefList, RefsQuery } from '../domain/refs.js'

export type RefsService = {
  list(query: RefsQuery): Promise<RefList>
}

export function createRefsService(git: GitRefsClient): RefsService {
  return {
    async list(query) {
      const [head, branchesAll, tagsAll] = await Promise.all([
        git.headRef(),
        git.listBranches(),
        git.listTags(),
      ])

      const needle = query.q.toLowerCase()
      const matches = (name: string): boolean =>
        needle.length === 0 || name.toLowerCase().includes(needle)

      const filteredBranches = branchesAll.filter(matches)
      const filteredTags = tagsAll.filter(matches)

      // ADR 0018: ブランチを先に詰め、残り枠でタグを詰める
      const limit = query.limit
      const branches = filteredBranches.slice(0, limit)
      const remaining = Math.max(0, limit - branches.length)
      const tags = filteredTags.slice(0, remaining)

      const truncated =
        branches.length < filteredBranches.length || tags.length < filteredTags.length

      return {
        head,
        branches,
        tags,
        truncated,
      }
    },
  }
}
