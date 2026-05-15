/**
 * tree (ディレクトリ一覧) HTTP controller (ADR 0022)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev / path クエリのパースは controller/query-params.ts に共通化されている
 */

import type { TreeEntryDto, TreeResponseDto } from '@git-web/common'
import type { TreeEntry } from '../domain/tree.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { TreeService } from '../service/tree-service.js'
import { parsePathParam, parseRevParam } from './query-params.js'

export function createTreeHandler(service: TreeService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevParam(url.searchParams)
    const path = parsePathParam(url.searchParams)
    const entries = await service.getTree(rev, path)
    return jsonResponse(200, toTreeResponseDto(entries))
  }
}

function toTreeEntryDto(entry: TreeEntry): TreeEntryDto {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    status: entry.status,
    mode: entry.mode,
    size: entry.size,
  }
}

function toTreeResponseDto(entries: ReadonlyArray<TreeEntry>): TreeResponseDto {
  return {
    entries: entries.map(toTreeEntryDto),
  }
}
