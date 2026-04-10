import type { TreeEntryDto, TreeResponseDto } from '@git-web/common'

/**
 * tree API 呼び出しのクライアント層 (ADR 0022)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 */

/**
 * GET /api/tree?rev=<rev>&path=<path> を呼んでツリーエントリを取得する。
 *
 * @param rev リビジョン。null の場合は worktree (rev キーを付けない)
 * @param path ディレクトリパス。空文字の場合はルート (path キーを付けない)
 */
export async function fetchTree(
  rev: string | null,
  path: string,
): Promise<ReadonlyArray<TreeEntryDto>> {
  const url = buildUrl(rev, path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/tree returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isTreeResponseDto(data)) {
    throw new Error('/api/tree returned unexpected body shape')
  }
  return data.entries
}

function buildUrl(rev: string | null, path: string): string {
  const params = new URLSearchParams()
  if (rev !== null) {
    params.set('rev', rev)
  }
  if (path !== '') {
    params.set('path', path)
  }
  const query = params.toString()
  return query === '' ? '/api/tree' : `/api/tree?${query}`
}

// ---------- 型ガード ----------

function isTreeEntryDto(value: unknown): value is TreeEntryDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || typeof value.name !== 'string') return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('type' in value)) return false
  const t = value.type
  return t === 'blob' || t === 'tree'
}

function isTreeResponseDto(value: unknown): value is TreeResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('entries' in value) || !Array.isArray(value.entries)) return false
  return value.entries.every((e: unknown) => isTreeEntryDto(e))
}
