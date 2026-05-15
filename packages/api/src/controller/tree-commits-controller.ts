/**
 * tree-commits (ファイル単位最終コミット) HTTP controller (ADR 0054 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev / path クエリのパースは controller/query-params.ts に共通化されている
 *   - rev: キー無し → worktree (null、service が HEAD に解決)
 *   - path: キー無し / 空文字 → ルートディレクトリ
 *   - wt: キー無し / 空文字 → default worktree
 */

import type { TreeCommitDto, TreeCommitsResponseDto } from '@git-web/common'
import { UnknownWorktreeError } from '../domain/errors.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import { createTreeService } from '../service/tree-service.js'
import type { TreeCommitResult, TreeCommitsService } from '../service/tree-commits-service.js'
import { parsePathParam, parseRevParam, parseWtParam } from './query-params.js'

export type TreeCommitsHandlerDeps = {
  readonly service: TreeCommitsService
  readonly resolver: WorktreeContextResolver
  readonly factory: WorktreeClientsFactory
}

export function createTreeCommitsHandler(deps: TreeCommitsHandlerDeps): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const wtName = parseWtParam(url.searchParams)
    const rev = parseRevParam(url.searchParams)
    const path = parsePathParam(url.searchParams)

    const context = await deps.resolver.resolve(wtName)
    if (context === null) {
      throw new UnknownWorktreeError(wtName ?? '')
    }
    const clients = deps.factory(context.path)
    const treeService = createTreeService(clients.gitTreeClient, clients.worktreeTreeLister)

    const results = await deps.service.getTreeCommits(
      { gitClient: clients.gitClient, treeCommitsClient: clients.treeCommitsClient },
      treeService,
      rev,
      path,
    )
    return jsonResponse(200, toResponseDto(results))
  }
}

function toEntryDto(entry: TreeCommitResult): TreeCommitDto {
  if (entry.lastCommit === null) {
    return { name: entry.name, lastCommit: null }
  }
  return {
    name: entry.name,
    lastCommit: {
      hash: entry.lastCommit.hash,
      date: entry.lastCommit.date,
      subject: entry.lastCommit.subject,
    },
  }
}

function toResponseDto(entries: ReadonlyArray<TreeCommitResult>): TreeCommitsResponseDto {
  return { entries: entries.map(toEntryDto) }
}
