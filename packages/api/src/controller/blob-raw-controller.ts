/**
 * blob raw HTTP controller (ADR 0028 / ADR 0055)。
 *
 * GET /api/blob/raw?path=<path>&rev=<rev>&wt=<wt> で生バイナリを Content-Type
 * 付きで返す。主に画像ファイルの表示用。
 *
 * wt クエリ (ADR 0055):
 * - キーが無い / 空文字: default worktree
 * - キーあり: 形式検証 → resolver で BoundedWorktreePath に解決
 */

import { inferContentType } from '../domain/content-type.js'
import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidDiffPathError, UnknownWorktreeError } from '../domain/errors.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'
import { notFoundResponse } from '../http/response.js'
import type { Handler, HttpResponse } from '../http/router.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import { parseWtParam } from './query-params.js'

export type BlobRawHandlerDeps = {
  readonly resolver: WorktreeContextResolver
  readonly factory: WorktreeClientsFactory
}

export function createBlobRawHandler(deps: BlobRawHandlerDeps): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const pathParam = url.searchParams.get('path')
    if (pathParam === null || pathParam === '') {
      throw new InvalidDiffPathError(pathParam ?? '', 'missing path parameter')
    }
    const path = parseDiffPath(pathParam)
    const wtName = parseWtParam(url.searchParams)
    const rev = parseRevParam(url.searchParams)

    const context = await deps.resolver.resolve(wtName)
    if (context === null) {
      throw new UnknownWorktreeError(wtName ?? '')
    }
    const clients = deps.factory(context.path)

    const result = await clients.rawBlobReader.read(path, rev)
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
