/**
 * worktree HTTP controller (ADR 0023)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - path クエリの扱い:
 *   - キーが無い / 空文字: ルートディレクトリ (path = '')
 *   - キーあり: parseDiffPath で検証
 */

import type { WorktreeEntryDto, WorktreeResponseDto } from '@git-web/common'
import { parseDiffPath } from '../domain/diff-path.js'
import type { WorktreeEntry } from '../domain/worktree-entry.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { WorktreeService } from '../service/worktree-service.js'

export function createWorktreeHandler(service: WorktreeService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const path = parsePathParam(url.searchParams)
    const entries = await service.getWorktreeEntries(path)
    return jsonResponse(200, toWorktreeResponseDto(entries))
  }
}

function parsePathParam(params: URLSearchParams): string {
  const raw = params.get('path')
  if (raw === null || raw === '') {
    return ''
  }
  return parseDiffPath(raw)
}

function toWorktreeEntryDto(entry: WorktreeEntry): WorktreeEntryDto {
  return {
    status: entry.status,
    name: entry.name,
    path: entry.path,
    type: entry.type,
    mode: entry.mode,
    size: entry.size,
  }
}

function toWorktreeResponseDto(entries: ReadonlyArray<WorktreeEntry>): WorktreeResponseDto {
  return {
    entries: entries.map(toWorktreeEntryDto),
  }
}
