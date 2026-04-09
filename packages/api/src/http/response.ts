/**
 * controller 間で共通する HTTP レスポンスヘルパ。
 *
 * 設計方針:
 * - 各 controller で個別に定義していた jsonResponse / notFoundResponse /
 *   errorJsonResponse を 1 箇所に集約する (ADR 0011 の補遺)
 * - controller は本モジュールから import するだけで同じ content-type /
 *   cache-control を得られる
 * - 本モジュールは HTTP 層に属し、ドメインや common DTO には依存しない
 */

import type { HttpResponse } from './router.js'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
// diff / blob / repo の内容はリビジョンによって変動するためキャッシュ禁止
const NO_STORE = 'no-store'

/**
 * 任意の値を JSON シリアライズして HttpResponse として返す。
 * 呼び出し側は body をすでに DTO に写像済みの値として渡す。
 */
export function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: {
      'content-type': JSON_CONTENT_TYPE,
      'cache-control': NO_STORE,
    },
    body: JSON.stringify(body),
  }
}

/**
 * 404 レスポンス。
 * body は `{ error: 'not_found', message }` の形で固定する。
 */
export function notFoundResponse(message: string): HttpResponse {
  return jsonResponse(404, { error: 'not_found', message })
}

/**
 * error-mapper 用。code / message を指定してエラー JSON を返す。
 */
export function errorJsonResponse(status: number, code: string, message: string): HttpResponse {
  return jsonResponse(status, { error: code, message })
}
