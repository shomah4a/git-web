import type { BlobDto } from '@git-web/common'

/**
 * blob API 呼び出しのクライアント層 (ADR 0016 / ADR 0017)。
 *
 * 設計方針:
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止、ADR 0010)
 * - クエリは URLSearchParams 経由 (`path` / `rev` を安全にエンコード)
 * - rev === null は worktree を指す。キーを付けないことで
 *   blob エンドポイントに worktree リクエストを送る (ADR 0016 のセマンティクス)
 * - 404 は null を返す (呼び出し側で該当ファイルをプレーン fallback)
 * - 4xx/5xx は throw し、runDiffLoad 側で該当ファイルだけ silent fallback する
 */

/**
 * GET /api/blob?path=<path>&rev=<rev>&wt=<wt> を呼んで blob を取得する。
 *
 * @param path 対象ファイルパス (相対パス)
 * @param rev  リビジョン。null の場合は worktree (rev キーを付けない)
 * @param wt   対象 worktree 名 (ADR 0055)。null の場合は default worktree
 * @returns 成功時は BlobDto、404 の場合は null
 */
export async function fetchBlob(
  path: string,
  rev: string | null,
  wt: string | null = null,
): Promise<BlobDto | null> {
  const url = buildUrl(path, rev, wt)
  const response = await fetch(url)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`/api/blob returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isBlobDto(data)) {
    throw new Error('/api/blob returned unexpected body shape')
  }
  return data
}

function buildUrl(path: string, rev: string | null, wt: string | null): string {
  const params = new URLSearchParams()
  params.set('path', path)
  if (rev !== null) {
    params.set('rev', rev)
  }
  if (wt !== null && wt !== '') {
    params.set('wt', wt)
  }
  return `/api/blob?${params.toString()}`
}

// ---------- 型ガード ----------

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isBlobDto(value: unknown): value is BlobDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('rev' in value) || !isStringOrNull(value.rev)) return false
  if (!('content' in value) || typeof value.content !== 'string') return false
  if (!('binary' in value) || typeof value.binary !== 'boolean') return false
  if (!('language' in value) || !isStringOrNull(value.language)) return false
  return true
}
