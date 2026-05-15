/**
 * tree-commits (ファイル単位最終コミット) HTTP controller (ADR 0054)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev / path クエリのパースは controller/query-params.ts に共通化されている
 *   - rev: キー無し → worktree (null、service が HEAD に解決)
 *   - path: キー無し / 空文字 → ルートディレクトリ
 */

import type { TreeCommitDto, TreeCommitsResponseDto } from '@git-web/common'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { TreeCommitResult, TreeCommitsService } from '../service/tree-commits-service.js'
import { parsePathParam, parseRevParam } from './query-params.js'

export function createTreeCommitsHandler(service: TreeCommitsService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevParam(url.searchParams)
    const path = parsePathParam(url.searchParams)
    const results = await service.getTreeCommits(rev, path)
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
