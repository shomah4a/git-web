/**
 * blob (ファイル内容) HTTP controller (ADR 0016 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - クエリパース + バリデーション + DTO 変換を担当する
 * - path は必須。欠落 / 空文字は InvalidDiffPathError を throw
 *   (error-mapper で 400)
 * - rev クエリの扱い:
 *   - キー自体が無い: worktree (rev = null)
 *   - キーあり (空文字含む): parseRevision に渡す。空文字は
 *     InvalidRevisionError で 400
 * - wt クエリ (ADR 0055):
 *   - キーが無い / 空文字: default worktree
 *   - キーあり: 形式検証 → resolver で BoundedWorktreePath に解決
 * - service が null を返した場合は 404
 * - ドメインモデル → DTO 変換は object literal で書き、`as` は使わない
 */

import type { BlobDto } from '@git-web/common'
import type { Blob } from '../domain/blob.js'
import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidDiffPathError, UnknownWorktreeError } from '../domain/errors.js'
import { parseRevision } from '../domain/revision.js'
import { jsonResponse, notFoundResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import type { BlobService } from '../service/blob-service.js'
import { parseWtParam } from './query-params.js'

export type BlobHandlerDeps = {
  readonly service: BlobService
  readonly resolver: WorktreeContextResolver
  readonly factory: WorktreeClientsFactory
}

export function createBlobHandler(deps: BlobHandlerDeps): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const pathParam = url.searchParams.get('path')
    if (pathParam === null || pathParam === '') {
      throw new InvalidDiffPathError(pathParam ?? '', 'missing path parameter')
    }
    const path = parseDiffPath(pathParam)
    const wtName = parseWtParam(url.searchParams)
    const rev = parseRevParamLocal(url.searchParams)

    const context = await deps.resolver.resolve(wtName)
    if (context === null) {
      throw new UnknownWorktreeError(wtName ?? '')
    }
    const clients = deps.factory(context.path)

    const blob = await deps.service.getBlob(clients.worktreeBlobReader, path, rev)
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
function parseRevParamLocal(
  params: URLSearchParams,
): import('../domain/revision.js').Revision | null {
  if (!params.has('rev')) {
    return null
  }
  const raw = params.get('rev') ?? ''
  return parseRevision(raw)
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
