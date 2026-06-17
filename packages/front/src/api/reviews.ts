import type { ReviewCommentDto, ReviewListResponseDto } from '@git-web/common'

/**
 * レビューコメント API のクライアント層 (ADR 0057 / 0059)。
 *
 * 設計方針 (ADR 0010):
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止)
 * - アンカー SHA は 40 桁 hex を front 側でも厳格に検証する (H-1)。改ざんされた
 *   review ファイル由来の不正 SHA を弾く
 * - POST は同一オリジン fetch で Origin が自動付与される。server 側 (ADR 0059)
 *   が Origin/Host を検査する
 */

const SHA40_PATTERN = /^[0-9a-f]{40}$/

export type CreateReviewInput = {
  readonly sha: string
  readonly path: string
  readonly newLineStart: number
  readonly newLineEnd: number
  readonly body: string
}

/**
 * GET /api/reviews?rev=<rev> を呼び、指定リビジョンのコメント一覧を取得する。
 */
export async function fetchReviews(rev: string): Promise<ReviewListResponseDto> {
  const url = `/api/reviews?${new URLSearchParams({ rev }).toString()}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`/api/reviews returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isReviewListResponseDto(data)) {
    throw new Error('/api/reviews returned unexpected body shape')
  }
  return data
}

/**
 * POST /api/reviews でコメントを作成する。作成された DTO を返す。
 */
export async function postReview(input: CreateReviewInput): Promise<ReviewCommentDto> {
  const response = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`POST /api/reviews returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isReviewCommentDto(data)) {
    throw new Error('POST /api/reviews returned unexpected body shape')
  }
  return data
}

/**
 * POST /api/reviews/resolve で resolved 状態を切り替える。
 */
export async function postResolve(params: {
  sha: string
  id: string
  resolved: boolean
}): Promise<void> {
  const response = await fetch('/api/reviews/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    throw new Error(`POST /api/reviews/resolve returned HTTP ${response.status.toString()}`)
  }
}

// ---------- 型ガード ----------

export function isReviewCommentDto(value: unknown): value is ReviewCommentDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('sha' in value) || typeof value.sha !== 'string' || !SHA40_PATTERN.test(value.sha)) {
    return false
  }
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('newLineStart' in value) || typeof value.newLineStart !== 'number') return false
  if (!('newLineEnd' in value) || typeof value.newLineEnd !== 'number') return false
  if (!('body' in value) || typeof value.body !== 'string') return false
  if (!('createdAt' in value) || typeof value.createdAt !== 'string') return false
  if (!('resolved' in value) || typeof value.resolved !== 'boolean') return false
  return true
}

function isReviewListResponseDto(value: unknown): value is ReviewListResponseDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('sha' in value) || typeof value.sha !== 'string' || !SHA40_PATTERN.test(value.sha)) {
    return false
  }
  if (!('comments' in value) || !Array.isArray(value.comments)) return false
  for (const comment of value.comments) {
    if (!isReviewCommentDto(comment)) return false
  }
  return true
}
