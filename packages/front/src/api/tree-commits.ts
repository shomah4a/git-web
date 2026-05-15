import type { LastCommitDto, TreeCommitDto, TreeCommitsResponseDto } from '@git-web/common'

/**
 * tree-commits API 呼び出しのクライアント層 (ADR 0054)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 */

/**
 * GET /api/tree-commits?rev=<rev>&path=<path> を呼んで最終コミット情報を取得する。
 *
 * @param rev リビジョン。null の場合は worktree (rev キーを付けない)
 * @param path ディレクトリパス。空文字の場合はルート (path キーを付けない)
 */
export async function fetchTreeCommits(
  rev: string | null,
  path: string,
): Promise<ReadonlyArray<TreeCommitDto>> {
  const url = buildUrl(rev, path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/tree-commits returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isTreeCommitsResponseDto(data)) {
    throw new Error('/api/tree-commits returned unexpected body shape')
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
  return query === '' ? '/api/tree-commits' : `/api/tree-commits?${query}`
}

// ---------- 型ガード ----------

function isLastCommitDto(value: unknown): value is LastCommitDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('hash' in value) || typeof value.hash !== 'string') return false
  if (!('date' in value) || typeof value.date !== 'number') return false
  if (!('subject' in value) || typeof value.subject !== 'string') return false
  return true
}

function isTreeCommitDto(value: unknown): value is TreeCommitDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || typeof value.name !== 'string') return false
  if (!('lastCommit' in value)) return false
  const lc = value.lastCommit
  if (lc !== null && !isLastCommitDto(lc)) return false
  return true
}

function isTreeCommitsResponseDto(value: unknown): value is TreeCommitsResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('entries' in value) || !Array.isArray(value.entries)) return false
  return value.entries.every((e: unknown) => isTreeCommitDto(e))
}
