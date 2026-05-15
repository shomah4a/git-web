import type { WorktreeListItemDto, WorktreesListResponseDto } from '@git-web/common'

/**
 * worktrees-list API 呼び出しのクライアント層 (ADR 0055)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 */

/**
 * GET /api/worktrees を呼んで worktree 一覧を取得する。
 */
export async function fetchWorktreesList(): Promise<ReadonlyArray<WorktreeListItemDto>> {
  const response = await fetch('/api/worktrees')
  if (!response.ok) {
    throw new Error(`/api/worktrees returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isWorktreesListResponseDto(data)) {
    throw new Error('/api/worktrees returned unexpected body shape')
  }
  return data.items
}

// ---------- 型ガード ----------

function isWorktreeListItemDto(value: unknown): value is WorktreeListItemDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || typeof value.name !== 'string') return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('headHash' in value)) return false
  if (value.headHash !== null && typeof value.headHash !== 'string') return false
  if (!('branch' in value)) return false
  if (value.branch !== null && typeof value.branch !== 'string') return false
  if (!('isDetached' in value) || typeof value.isDetached !== 'boolean') return false
  if (!('isDefault' in value) || typeof value.isDefault !== 'boolean') return false
  if (!('isMain' in value) || typeof value.isMain !== 'boolean') return false
  return true
}

function isWorktreesListResponseDto(value: unknown): value is WorktreesListResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('items' in value) || !Array.isArray(value.items)) return false
  return value.items.every((e: unknown) => isWorktreeListItemDto(e))
}
