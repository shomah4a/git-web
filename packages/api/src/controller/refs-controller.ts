/**
 * /api/refs の HTTP controller (ADR 0018)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - バリデーション失敗は InvalidRefsQueryError を throw する
 *   (error-mapper で 400 にマップ)
 * - ドメインモデル → DTO 変換は object literal で書き、`as` は使わない
 */

import type { RefListDto } from '@git-web/common'
import { parseRefsQuery } from '../domain/refs-query.js'
import type { RefList } from '../domain/refs.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { RefsService } from '../service/refs-service.js'

/**
 * GET /api/refs のハンドラファクトリ。
 */
export function createRefsHandler(service: RefsService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const query = parseRefsQuery(url.searchParams.get('q'), url.searchParams.get('limit'))
    const refs = await service.list(query)
    return jsonResponse(200, toRefListDto(refs))
  }
}

function toRefListDto(refs: RefList): RefListDto {
  return {
    head: refs.head,
    branches: [...refs.branches],
    tags: [...refs.tags],
    truncated: refs.truncated,
  }
}
