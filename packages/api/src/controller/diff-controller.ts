/**
 * diff 表示の HTTP controller。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - バリデーション失敗は InvalidRevisionError / InvalidDiffRangeError /
 *   InvalidDiffPathError を throw する (http 層の error-mapper で 400 にマップ)
 * - ドメインモデル → DTO 変換は object literal で書き、`as` は使わない
 *   (ADR 0010)
 * - service は注入される
 */

import type {
  DiffFileDto,
  DiffFileSummaryDto,
  DiffFilesResponseDto,
  DiffHunkDto,
  DiffLineDto,
} from '@git-web/common'
import type { DiffFile, DiffFileSummary, DiffHunk, DiffLine } from '../domain/diff.js'
import { parseDiffPath } from '../domain/diff-path.js'
import type { DiffRange } from '../domain/diff-range.js'
import { buildDiffRange } from '../domain/diff-range.js'
import { InvalidDiffPathError } from '../domain/errors.js'
import { parseRevision } from '../domain/revision.js'
import type { Handler, HttpResponse } from '../http/router.js'
import type { DiffService } from '../service/diff-service.js'

/**
 * GET /api/diff/files のハンドラファクトリ。
 */
export function createDiffFilesHandler(service: DiffService): Handler {
  return async (req) => {
    const range = parseRangeFromUrl(req.url)
    const files = await service.getDiffFileList(range)
    const body: DiffFilesResponseDto = {
      files: files.map(toDiffFileSummaryDto),
    }
    return jsonResponse(200, body)
  }
}

/**
 * GET /api/diff/file のハンドラファクトリ。
 *
 * - path クエリが必須。欠落時は InvalidDiffPathError
 * - 対象ファイルの diff が存在しない場合は 404
 */
export function createDiffFileHandler(service: DiffService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const pathParam = url.searchParams.get('path')
    if (pathParam === null) {
      throw new InvalidDiffPathError('', 'missing path parameter')
    }
    const path = parseDiffPath(pathParam)
    const range = parseRangeFromSearchParams(url.searchParams)
    const file = await service.getDiffFile(range, path)
    if (file === null) {
      return notFoundResponse('diff not found for the specified path and range')
    }
    return jsonResponse(200, toDiffFileDto(file))
  }
}

/**
 * URL 文字列から DiffRange を構築する。
 * 内部で parseRevision / buildDiffRange を呼ぶ。
 */
function parseRangeFromUrl(url: string): DiffRange {
  const u = new URL(url, 'http://localhost')
  return parseRangeFromSearchParams(u.searchParams)
}

function parseRangeFromSearchParams(params: URLSearchParams): DiffRange {
  const fromRaw = params.get('from')
  const toRaw = params.get('to')
  const from = fromRaw === null ? undefined : parseRevision(fromRaw)
  const to = toRaw === null ? undefined : parseRevision(toRaw)
  return buildDiffRange(from, to)
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // diff の内容はリビジョンによって変動するためキャッシュ禁止
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  }
}

function notFoundResponse(message: string): HttpResponse {
  return {
    status: 404,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({ error: 'not_found', message }),
  }
}

function toDiffFileSummaryDto(file: DiffFileSummary): DiffFileSummaryDto {
  return {
    path: file.path,
    oldPath: file.oldPath,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
  }
}

function toDiffFileDto(file: DiffFile): DiffFileDto {
  return {
    path: file.path,
    oldPath: file.oldPath,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    language: file.language,
    hunks: file.hunks.map(toDiffHunkDto),
  }
}

function toDiffHunkDto(hunk: DiffHunk): DiffHunkDto {
  return {
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    header: hunk.header,
    lines: hunk.lines.map(toDiffLineDto),
  }
}

function toDiffLineDto(line: DiffLine): DiffLineDto {
  return {
    kind: line.kind,
    content: line.content,
    oldLineNo: line.oldLineNo,
    newLineNo: line.newLineNo,
  }
}
