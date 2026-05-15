/**
 * /api/worktrees HTTP controller (ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - クエリは無し。GET でレスポンスのみ返す
 * - service の WorktreeListItem を DTO に変換する
 * - `refs/heads/` 接頭辞を branch から除去する (DTO の規約)
 */

import type { WorktreeListItemDto, WorktreesListResponseDto } from '@git-web/common'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { WorktreeListItem, WorktreesListService } from '../service/worktrees-list-service.js'

const REFS_HEADS_PREFIX = 'refs/heads/'

export function createWorktreesListHandler(service: WorktreesListService): Handler {
  return async () => {
    const items = await service.listWorktrees()
    return jsonResponse(200, toResponseDto(items))
  }
}

function toItemDto(item: WorktreeListItem): WorktreeListItemDto {
  return {
    name: item.name,
    path: item.path,
    headHash: item.headHash,
    branch: stripRefsHeads(item.branchRef),
    isDetached: item.isDetached,
    isDefault: item.isDefault,
    isMain: item.isMain,
  }
}

function stripRefsHeads(ref: string | null): string | null {
  if (ref === null) return null
  if (ref.startsWith(REFS_HEADS_PREFIX)) {
    return ref.slice(REFS_HEADS_PREFIX.length)
  }
  return ref
}

function toResponseDto(items: ReadonlyArray<WorktreeListItem>): WorktreesListResponseDto {
  return { items: items.map(toItemDto) }
}
