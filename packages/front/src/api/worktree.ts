import type { WorktreeEntryDto, WorktreeResponseDto } from '@git-web/common'

/**
 * worktree API 呼び出しのクライアント層 (ADR 0023)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 */

/**
 * GET /api/worktree?path=<path> を呼んで worktree エントリを取得する。
 *
 * @param path ディレクトリパス。空文字の場合はルート
 */
export async function fetchWorktree(path: string): Promise<ReadonlyArray<WorktreeEntryDto>> {
  const url = buildUrl(path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/worktree returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isWorktreeResponseDto(data)) {
    throw new Error('/api/worktree returned unexpected body shape')
  }
  return data.entries
}

function buildUrl(path: string): string {
  if (path === '') {
    return '/api/worktree'
  }
  const params = new URLSearchParams()
  params.set('path', path)
  return `/api/worktree?${params.toString()}`
}

// ---------- 型ガード ----------

function isWorktreeEntryDto(value: unknown): value is WorktreeEntryDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || typeof value.name !== 'string') return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('type' in value)) return false
  if (!('status' in value)) return false
  if (!('mode' in value)) return false
  if (!('size' in value)) return false
  const t = value.type
  if (t !== 'blob' && t !== 'tree') return false
  const s = value.status
  if (s !== null && s !== 'added' && s !== 'modified' && s !== 'deleted' && s !== 'untracked') {
    return false
  }
  const m = value.mode
  if (m !== null && typeof m !== 'string') return false
  const sz = value.size
  return sz === null || typeof sz === 'number'
}

function isWorktreeResponseDto(value: unknown): value is WorktreeResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('entries' in value) || !Array.isArray(value.entries)) return false
  return value.entries.every((e: unknown) => isWorktreeEntryDto(e))
}
