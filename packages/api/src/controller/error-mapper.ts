/**
 * ドメイン例外を HTTP レスポンスにマッピングする土台。
 *
 * 設計方針 (ADR 0011):
 * - 想定内のドメイン例外は instanceof で判定して固定ステータスを返す
 * - 想定外の例外は null を返し、呼び出し側で 500 として扱う
 * - フレームワーク移行時はこのファイルの参照側のみ差し替える
 *
 * 注意: start() の事前チェックで投げられる NotAGitRepositoryError は
 * HTTP リクエスト処理経路ではなく、本マッピングの対象外である。
 * 本関数は将来 controller 内で想定内エラーが発生する場合に備えた土台で、
 * 現時点では controller からは呼び出されない。
 */

import { NotAGitRepositoryError } from '../domain/errors.js'
import type { HttpResponse } from '../http/router.js'

/**
 * 例外を HTTP レスポンスにマッピングする。
 *
 * - 想定内のドメイン例外なら対応する HttpResponse を返す
 * - 想定外なら null を返す。呼び出し側で 500 にマップする責務を持つ
 */
export function mapDomainErrorToHttpResponse(err: unknown): HttpResponse | null {
  if (err instanceof NotAGitRepositoryError) {
    return {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'not_a_git_repository', message: err.message }),
    }
  }
  return null
}
