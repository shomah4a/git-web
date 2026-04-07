import type { DiffFileDto, DiffFilesResponseDto } from '@git-web/common'

/**
 * diff API 呼び出しのクライアント層。
 *
 * 設計方針 (ADR 0010 / ADR 0012):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 * - クエリパラメータの組み立ては URLSearchParams を使い、
 *   encodeURIComponent 相当のエンコードを自動的に行う (L3 対応)
 * - 深い構造の厳密検査は将来 zod 等で置き換える想定。現状は
 *   「自分が書いたサーバーからのレスポンス」を信頼して必要最小限の narrow
 *   のみ行う
 */

export type DiffRangeQuery = {
  readonly from?: string
  readonly to?: string
}

/**
 * GET /api/diff/files を呼んでファイル一覧を取得する。
 */
export async function fetchDiffFiles(range: DiffRangeQuery = {}): Promise<DiffFilesResponseDto> {
  const url = buildUrl('/api/diff/files', range)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/diff/files returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isDiffFilesResponseDto(data)) {
    throw new Error('/api/diff/files returned unexpected body shape')
  }
  return data
}

/**
 * GET /api/diff/file?path=... を呼んで個別ファイルの diff を取得する。
 *
 * サーバーが 404 を返した場合は null を返す (呼び出し側で UI を出す)。
 */
export async function fetchDiffFile(
  path: string,
  range: DiffRangeQuery = {},
): Promise<DiffFileDto | null> {
  const url = buildUrl('/api/diff/file', { ...range, path })
  const response = await fetch(url)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`/api/diff/file returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isDiffFileDto(data)) {
    throw new Error('/api/diff/file returned unexpected body shape')
  }
  return data
}

function buildUrl(basePath: string, params: Readonly<Record<string, string | undefined>>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value)
    }
  }
  const query = searchParams.toString()
  return query === '' ? basePath : `${basePath}?${query}`
}

// ---------- 型ガード ----------

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isDiffFileStatus(value: unknown): value is DiffFileDto['status'] {
  return (
    value === 'added' ||
    value === 'deleted' ||
    value === 'modified' ||
    value === 'renamed' ||
    value === 'copied'
  )
}

function isDiffLineKind(
  value: unknown,
): value is DiffFileDto['hunks'][number]['lines'][number]['kind'] {
  return value === 'context' || value === 'add' || value === 'delete'
}

function isDiffFileSummary(value: unknown): value is DiffFilesResponseDto['files'][number] {
  if (typeof value !== 'object' || value === null) return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('oldPath' in value) || !isStringOrNull(value.oldPath)) return false
  if (!('status' in value) || !isDiffFileStatus(value.status)) return false
  if (!('additions' in value) || typeof value.additions !== 'number') return false
  if (!('deletions' in value) || typeof value.deletions !== 'number') return false
  if (!('binary' in value) || typeof value.binary !== 'boolean') return false
  return true
}

function isDiffLine(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (!('kind' in value) || !isDiffLineKind(value.kind)) return false
  if (!('content' in value) || typeof value.content !== 'string') return false
  if (!('oldLineNo' in value) || !isNumberOrNull(value.oldLineNo)) return false
  if (!('newLineNo' in value) || !isNumberOrNull(value.newLineNo)) return false
  return true
}

function isDiffHunk(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (!('oldStart' in value) || typeof value.oldStart !== 'number') return false
  if (!('oldLines' in value) || typeof value.oldLines !== 'number') return false
  if (!('newStart' in value) || typeof value.newStart !== 'number') return false
  if (!('newLines' in value) || typeof value.newLines !== 'number') return false
  if (!('header' in value) || typeof value.header !== 'string') return false
  if (!('lines' in value) || !Array.isArray(value.lines)) return false
  for (const line of value.lines) {
    if (!isDiffLine(line)) return false
  }
  return true
}

function isDiffFileDto(value: unknown): value is DiffFileDto {
  if (!isDiffFileSummary(value)) return false
  if (!('language' in value) || !isStringOrNull(value.language)) return false
  if (!('hunks' in value) || !Array.isArray(value.hunks)) return false
  for (const hunk of value.hunks) {
    if (!isDiffHunk(hunk)) return false
  }
  return true
}

function isDiffFilesResponseDto(value: unknown): value is DiffFilesResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('files' in value) || !Array.isArray(value.files)) return false
  for (const file of value.files) {
    if (!isDiffFileSummary(file)) return false
  }
  return true
}
