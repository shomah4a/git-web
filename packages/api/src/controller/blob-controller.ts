/**
 * blob (ファイル内容) HTTP controller。
 *
 * 設計方針 (ADR 0011 / ADR 0016):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - path は必須。欠落 / 空文字は InvalidDiffPathError を throw
 *   (error-mapper で 400)
 * - rev クエリの扱い:
 *   - キー自体が無い: worktree (rev = null)
 *   - キーあり (空文字含む): parseRevision に渡す。空文字は
 *     InvalidRevisionError で 400
 * - service が null を返した場合は 404
 * - ドメインモデル → DTO 変換は object literal で書き、`as` は使わない
 */

import type { BlobDto } from '@git-web/common'
import type { Blob } from '../domain/blob.js'
import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidDiffPathError } from '../domain/errors.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import type { Handler, HttpResponse } from '../http/router.js'
import type { BlobService } from '../service/blob-service.js'

export function createBlobHandler(service: BlobService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const pathParam = url.searchParams.get('path')
    if (pathParam === null || pathParam === '') {
      throw new InvalidDiffPathError(pathParam ?? '', 'missing path parameter')
    }
    const path = parseDiffPath(pathParam)
    const rev = parseRevParam(url.searchParams)
    const blob = await service.getBlob(path, rev)
    if (blob === null) {
      return notFoundResponse('blob not found for the specified path and rev')
    }
    return jsonResponse(200, toBlobDto(blob))
  }
}

/**
 * rev クエリをパースする。
 * キーが無い場合は null (worktree)、キーがあれば parseRevision を通す。
 * 空文字の場合も parseRevision に渡して InvalidRevisionError で落とす。
 */
function parseRevParam(params: URLSearchParams): Revision | null {
  if (!params.has('rev')) {
    return null
  }
  const raw = params.get('rev') ?? ''
  return parseRevision(raw)
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
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

function toBlobDto(blob: Blob): BlobDto {
  return {
    path: blob.path,
    rev: blob.rev === null ? null : blob.rev.raw,
    content: blob.content,
    binary: blob.binary,
    language: blob.language,
  }
}
