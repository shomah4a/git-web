/**
 * レビューコメントの HTTP controller (ADR 0057)。
 *
 * 設計方針 (ADR 0011):
 * - クエリ/ボディのパース + バリデーション + DTO 変換を担当する
 * - ドメインモデル → DTO 変換は object literal で書き `as` は使わない (ADR 0010)
 * - service は注入される
 * - POST 系の Origin/Host/body 上限ガードは http 層 (server.ts, ADR 0059) が担う
 */

import type { ReviewCommentDto, ReviewListResponseDto } from '@git-web/common'
import type { ResolvedComment } from '../domain/review.js'
import { parseRevision } from '../domain/revision.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { ReviewService } from '../service/review-service.js'

/**
 * GET /api/reviews?rev=<revision> のハンドラファクトリ。
 *
 * rev は必須。欠落/空文字は parseRevision が InvalidRevisionError を投げ 400。
 * server 側で 40 桁 SHA に解決し、そのコミットのコメント一覧を返す。
 */
export function createReviewListHandler(service: ReviewService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevision(url.searchParams.get('rev') ?? '')
    const result = await service.listForRevision(rev)
    const body: ReviewListResponseDto = {
      sha: result.sha,
      comments: result.comments.map(toReviewCommentDto),
    }
    return jsonResponse(200, body)
  }
}

function toReviewCommentDto(comment: ResolvedComment): ReviewCommentDto {
  return {
    id: comment.id,
    sha: comment.sha.value,
    path: comment.path,
    newLineStart: comment.newLineStart,
    newLineEnd: comment.newLineEnd,
    body: comment.body,
    createdAt: comment.createdAt,
    resolved: comment.resolved,
  }
}
