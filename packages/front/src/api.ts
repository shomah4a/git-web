import type { RepoInfoDto } from '@git-web/common'

/**
 * GET /api/repo を叩いて RepoInfoDto を取得する。
 *
 * ADR 0010: レスポンスは unknown で受けて型ガードで narrowing する。
 * 型アサーションは使わない。
 */
export async function fetchRepoInfo(): Promise<RepoInfoDto> {
  const response = await fetch('/api/repo')
  if (!response.ok) {
    throw new Error(`/api/repo returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isRepoInfoDto(data)) {
    throw new Error('/api/repo returned unexpected body shape')
  }
  return data
}

/**
 * 値が RepoInfoDto の形をしているかを判定する型ガード。
 */
function isRepoInfoDto(value: unknown): value is RepoInfoDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('name' in value) || typeof value.name !== 'string') {
    return false
  }
  if (!('cwd' in value) || typeof value.cwd !== 'string') {
    return false
  }
  if (!('head' in value) || typeof value.head !== 'object' || value.head === null) {
    return false
  }
  const head: unknown = value.head
  if (typeof head !== 'object' || head === null) {
    return false
  }
  if (!('commitHash' in head) || typeof head.commitHash !== 'string') {
    return false
  }
  if (!('branch' in head) || (typeof head.branch !== 'string' && head.branch !== null)) {
    return false
  }
  return true
}
