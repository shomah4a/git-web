/**
 * blob raw HTTP controller (ADR 0028)。
 *
 * GET /api/blob/raw?path=<path>&rev=<rev> で生バイナリを Content-Type 付きで返す。
 * 主に画像ファイルの表示用。
 */

import { inferContentType } from '../domain/content-type.js'
import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidDiffPathError } from '../domain/errors.js'
import type { RawBlobReader } from '../domain/ports/raw-blob-reader.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import { notFoundResponse } from '../http/response.js'
import type { Handler, HttpResponse } from '../http/router.js'

export function createBlobRawHandler(reader: RawBlobReader): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const pathParam = url.searchParams.get('path')
    if (pathParam === null || pathParam === '') {
      throw new InvalidDiffPathError(pathParam ?? '', 'missing path parameter')
    }
    const path = parseDiffPath(pathParam)
    const rev = parseRevParam(url.searchParams)
    const result = await reader.read(path, rev)
    if (result === null) {
      return notFoundResponse('blob not found for the specified path and rev')
    }
    const contentType = inferContentType(path)
    return binaryResponse(200, result.buffer, contentType)
  }
}

function parseRevParam(params: URLSearchParams): Revision | null {
  if (!params.has('rev')) {
    return null
  }
  const raw = params.get('rev') ?? ''
  return parseRevision(raw)
}

function binaryResponse(status: number, body: Uint8Array, contentType: string): HttpResponse {
  return {
    status,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
    body,
  }
}
