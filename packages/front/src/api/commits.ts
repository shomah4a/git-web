import type { CommitDto, CommitsResponseDto, CommitStatsDto } from '@git-web/common'

/**
 * commits API 呼び出しのクライアント層 (ADR 0046)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 */

export type FetchCommitsParams = {
  readonly rev: string | null
  readonly after: string | null
  readonly limit: number
  readonly path: string | null
}

/**
 * GET /api/commits を呼んでコミット履歴を取得する。
 */
export async function fetchCommits(params: FetchCommitsParams): Promise<CommitsResponseDto> {
  const url = buildUrl(params)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/commits returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isCommitsResponseDto(data)) {
    throw new Error('/api/commits returned unexpected body shape')
  }
  return data
}

function buildUrl(params: FetchCommitsParams): string {
  const qs = new URLSearchParams()
  if (params.rev !== null) {
    qs.set('rev', params.rev)
  }
  if (params.after !== null) {
    qs.set('after', params.after)
  }
  if (params.limit !== 20) {
    qs.set('limit', params.limit.toString())
  }
  if (params.path !== null) {
    qs.set('path', params.path)
  }
  const query = qs.toString()
  return query === '' ? '/api/commits' : `/api/commits?${query}`
}

// ---------- 型ガード ----------

function isCommitStatsDto(value: unknown): value is CommitStatsDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('filesChanged' in value) || typeof value.filesChanged !== 'number') return false
  if (!('insertions' in value) || typeof value.insertions !== 'number') return false
  if (!('deletions' in value) || typeof value.deletions !== 'number') return false
  return true
}

function isCommitDto(value: unknown): value is CommitDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('hash' in value) || typeof value.hash !== 'string') return false
  if (!('parentCount' in value) || typeof value.parentCount !== 'number') return false
  if (!('authorName' in value) || typeof value.authorName !== 'string') return false
  if (!('authorEmail' in value) || typeof value.authorEmail !== 'string') return false
  if (!('date' in value) || typeof value.date !== 'number') return false
  if (!('subject' in value) || typeof value.subject !== 'string') return false
  if (!('body' in value) || typeof value.body !== 'string') return false
  if (!('stats' in value) || !isCommitStatsDto(value.stats)) return false
  return true
}

function isCommitsResponseDto(value: unknown): value is CommitsResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('commits' in value) || !Array.isArray(value.commits)) return false
  if (!('hasMore' in value) || typeof value.hasMore !== 'boolean') return false
  return value.commits.every((c: unknown) => isCommitDto(c))
}
