import type { RepoInfo } from '@git-web/common'

/**
 * GET /api/repo を叩いて RepoInfo を取得する。
 *
 * ADR 0010: レスポンスは unknown で受けて型ガードで narrowing する。
 * 型アサーションは使わない。
 */
export async function fetchRepoInfo(): Promise<RepoInfo> {
  const response = await fetch('/api/repo')
  if (!response.ok) {
    throw new Error(`/api/repo returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isRepoInfo(data)) {
    throw new Error('/api/repo returned unexpected body shape')
  }
  return data
}

/**
 * 値が RepoInfo の形をしているかを判定する型ガード。
 */
function isRepoInfo(value: unknown): value is RepoInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('cwd' in value) || typeof value.cwd !== 'string') {
    return false
  }
  if (!('head' in value) || typeof value.head !== 'string') {
    return false
  }
  return true
}
