/**
 * ドメイン例外を HTTP レスポンスにマッピングする。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - 想定内のドメイン例外は instanceof で判定して固定ステータスを返す
 * - 想定外の例外は null を返し、呼び出し側で 500 として扱う
 * - フレームワーク移行時はこのファイルの参照側のみ差し替える
 *
 * 注意: start() の事前チェックで投げられる NotAGitRepositoryError は
 * HTTP リクエスト処理経路ではなく、本マッピングの対象外である。
 * 現状 controller 層から投げられうる想定内ドメイン例外:
 * - InvalidRevisionError       → 400
 * - InvalidDiffRangeError      → 400
 * - InvalidDiffPathError       → 400
 * - NotAGitRepositoryError     → 500 (HTTP 経路での発生は想定していないが
 *                                      型としては残している)
 */

import {
  InvalidDiffPathError,
  InvalidDiffRangeError,
  InvalidRefsQueryError,
  InvalidRevisionError,
  InvalidWorktreeNameError,
  NotAGitRepositoryError,
  UnknownWorktreeError,
} from '../domain/errors.js'
import { errorJsonResponse } from '../http/response.js'
import type { HttpResponse } from '../http/router.js'

/**
 * 例外を HTTP レスポンスにマッピングする。
 *
 * - 想定内のドメイン例外なら対応する HttpResponse を返す
 * - 想定外なら null を返す。呼び出し側で 500 にマップする責務を持つ
 */
export function mapDomainErrorToHttpResponse(err: unknown): HttpResponse | null {
  if (err instanceof InvalidRevisionError) {
    return errorJsonResponse(400, 'invalid_revision', err.message)
  }
  if (err instanceof InvalidDiffRangeError) {
    return errorJsonResponse(400, 'invalid_diff_range', err.message)
  }
  if (err instanceof InvalidDiffPathError) {
    return errorJsonResponse(400, 'invalid_diff_path', err.message)
  }
  if (err instanceof InvalidRefsQueryError) {
    return errorJsonResponse(400, 'invalid_refs_query', err.message)
  }
  if (err instanceof InvalidWorktreeNameError) {
    return errorJsonResponse(400, 'invalid_worktree_name', err.message)
  }
  if (err instanceof UnknownWorktreeError) {
    return errorJsonResponse(400, 'unknown_worktree', err.message)
  }
  if (err instanceof NotAGitRepositoryError) {
    return errorJsonResponse(500, 'not_a_git_repository', err.message)
  }
  return null
}
