/**
 * tree-commits (ファイル単位最終コミット) HTTP controller (ADR 0054)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev クエリの扱い:
 *   - キー自体が無い: worktree (rev = null、service が HEAD に解決)
 *   - キーあり (空文字含む): parseRevision に渡す
 * - path クエリの扱い:
 *   - キーが無い / 空文字: ルートディレクトリ
 *   - キーあり: parseDiffPath で検証
 */

import type { TreeCommitDto, TreeCommitsResponseDto } from '@git-web/common'
import { parseDiffPath } from '../domain/diff-path.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { TreeCommitResult, TreeCommitsService } from '../service/tree-commits-service.js'

export function createTreeCommitsHandler(service: TreeCommitsService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevParam(url.searchParams)
    const path = parsePathParam(url.searchParams)
    const results = await service.getTreeCommits(rev, path)
    return jsonResponse(200, toResponseDto(results))
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
