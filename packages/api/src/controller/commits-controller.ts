/**
 * コミット履歴 HTTP controller (ADR 0046)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - rev クエリの扱い:
 *   - キー自体が無い / 空文字: HEAD (parseRevision('HEAD'))
 *   - キーあり: parseRevision に渡す
 * - after クエリの扱い:
 *   - キーが無い: null (先頭から取得)
 *   - キーあり: SHA 形式のみ許可 (カーソル用途)
 * - path クエリの扱い:
 *   - キーが無い / 空文字: null (パス絞り込みなし)
 *   - キーあり: parseDiffPath で検証
 */

import type { CommitDto, CommitsResponseDto, CommitStatsDto } from '@git-web/common'
import type { CommitEntry, CommitStats } from '../domain/commit.js'
import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidRevisionError } from '../domain/errors.js'
import type { LogResult } from '../domain/ports/git-log-client.js'
import { parseRevision } from '../domain/revision.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { CommitsService } from '../service/commits-service.js'

const SHA_PATTERN = /^[0-9a-f]{4,40}$/

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function createCommitsHandler(service: CommitsService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')

    const rev = parseRevParam(url.searchParams)
    const after = parseAfterParam(url.searchParams)
    const limit = parseLimitParam(url.searchParams)
    const path = parsePathParam(url.searchParams)

    const result = await service.getCommits({ rev, limit, after, path })

    return jsonResponse(200, toCommitsResponseDto(result))
  }
}

function parseRevParam(params: URLSearchParams): ReturnType<typeof parseRevision> {
  const raw = params.get('rev')
  if (raw === null || raw === '') {
    return parseRevision('HEAD')
  }
  return parseRevision(raw)
}

function parseAfterParam(params: URLSearchParams): string | null {
  const raw = params.get('after')
  if (raw === null || raw === '') {
    return null
  }
  if (!SHA_PATTERN.test(raw)) {
    throw new InvalidRevisionError(raw, 'shape')
  }
  return raw
}

function parseLimitParam(params: URLSearchParams): number {
  const raw = params.get('limit')
  if (raw === null || raw === '') {
    return DEFAULT_LIMIT
  }
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_LIMIT
  }
  return Math.min(parsed, MAX_LIMIT)
}

function parsePathParam(params: URLSearchParams): string | null {
  const raw = params.get('path')
  if (raw === null || raw === '') {
    return null
  }
  return parseDiffPath(raw)
}

function toCommitStatsDto(stats: CommitStats): CommitStatsDto {
  return {
    filesChanged: stats.filesChanged,
    insertions: stats.insertions,
    deletions: stats.deletions,
  }
}

function toCommitDto(entry: CommitEntry): CommitDto {
  return {
    hash: entry.hash,
    parentHashes: entry.parentHashes,
    parentCount: entry.parentCount,
    authorName: entry.authorName,
    authorEmail: entry.authorEmail,
    date: entry.date,
    subject: entry.subject,
    body: entry.body,
    stats: toCommitStatsDto(entry.stats),
  }
}

function toCommitsResponseDto(result: LogResult): CommitsResponseDto {
  return {
    commits: result.commits.map(toCommitDto),
    hasMore: result.hasMore,
  }
}
