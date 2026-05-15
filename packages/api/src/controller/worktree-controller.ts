/**
 * worktree HTTP controller (ADR 0023 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - path クエリの扱い:
 *   - キーが無い / 空文字: ルートディレクトリ (path = '')
 *   - キーあり: parseDiffPath で検証
 * - wt クエリの扱い (ADR 0055):
 *   - キーが無い / 空文字: default worktree
 *   - キーあり: 形式検証 → resolver で BoundedWorktreePath に解決
 *   - 未知 name は UnknownWorktreeError で 400
 */

import type { WorktreeEntryDto, WorktreeResponseDto } from '@git-web/common'
import { UnknownWorktreeError } from '../domain/errors.js'
import type { WorktreeEntry } from '../domain/worktree-entry.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import type { WorktreeService } from '../service/worktree-service.js'
import { parsePathParam, parseWtParam } from './query-params.js'

export type WorktreeHandlerDeps = {
  readonly service: WorktreeService
  readonly resolver: WorktreeContextResolver
  readonly factory: WorktreeClientsFactory
}

export function createWorktreeHandler(deps: WorktreeHandlerDeps): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const wtName = parseWtParam(url.searchParams)
    const path = parsePathParam(url.searchParams)

    const context = await deps.resolver.resolve(wtName)
    if (context === null) {
      throw new UnknownWorktreeError(wtName ?? '')
    }
    const clients = deps.factory(context.path)

    const entries = await deps.service.getWorktreeEntries(clients.worktreeLister, path)
    return jsonResponse(200, toWorktreeResponseDto(entries))
  }
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
