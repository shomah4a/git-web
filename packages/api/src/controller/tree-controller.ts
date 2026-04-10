/**
 * tree (ディレクトリ一覧) HTTP controller (ADR 0022)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev クエリの扱い:
 *   - キー自体が無い: worktree (rev = null)
 *   - キーあり (空文字含む): parseRevision に渡す
 * - path クエリの扱い:
 *   - キーが無い / 空文字: ルートディレクトリ (path = '')
 *   - キーあり: parseDiffPath で検証
 */

import type { TreeEntryDto, TreeResponseDto } from '@git-web/common'
import { parseDiffPath } from '../domain/diff-path.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import type { TreeEntry } from '../domain/tree.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { TreeService } from '../service/tree-service.js'

export function createTreeHandler(service: TreeService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevParam(url.searchParams)
    const path = parsePathParam(url.searchParams)
    const entries = await service.getTree(rev, path)
    return jsonResponse(200, toTreeResponseDto(entries))
  }
}

function parseRevParam(params: URLSearchParams): Revision | null {
  if (!params.has('rev')) {
    return null
  }
  const raw = params.get('rev') ?? ''
  return parseRevision(raw)
}

function parsePathParam(params: URLSearchParams): string {
  const raw = params.get('path')
  if (raw === null || raw === '') {
    return ''
  }
  return parseDiffPath(raw)
}

function toTreeEntryDto(entry: TreeEntry): TreeEntryDto {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
  }
}

function toTreeResponseDto(entries: ReadonlyArray<TreeEntry>): TreeResponseDto {
  return {
    entries: entries.map(toTreeEntryDto),
  }
}
