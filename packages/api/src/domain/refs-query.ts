/**
 * /api/refs のクエリパラメータをパースするドメイン関数 (ADR 0018)。
 *
 * 入力検査:
 * - q: 長さ 0〜255、制御文字禁止 (省略可)
 * - limit: 整数、1〜500 (省略可、既定 100)
 *
 * 失敗時は InvalidRefsQueryError を throw する。
 */

import { InvalidRefsQueryError } from './errors.js'
import type { RefsQuery } from './refs.js'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
const MIN_LIMIT = 1
const MAX_Q_LENGTH = 255

export function parseRefsQuery(qRaw: string | null, limitRaw: string | null): RefsQuery {
  const q = qRaw ?? ''
  if (q.length > MAX_Q_LENGTH) {
    throw new InvalidRefsQueryError(
      `q too long (${q.length.toString()} > ${MAX_Q_LENGTH.toString()})`,
    )
  }
  if (containsControlChars(q)) {
    throw new InvalidRefsQueryError('q contains control characters')
  }

  const limit = parseLimit(limitRaw)

  return { q, limit }
}

function containsControlChars(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function parseLimit(input: string | null): number {
  if (input === null || input === '') {
    return DEFAULT_LIMIT
  }
  if (!/^\d{1,4}$/.test(input)) {
    throw new InvalidRefsQueryError(`limit must be a positive integer: ${input}`)
  }
  const parsed = Number.parseInt(input, 10)
  if (parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
    throw new InvalidRefsQueryError(
      `limit out of range (${MIN_LIMIT.toString()}..${MAX_LIMIT.toString()}): ${parsed.toString()}`,
    )
  }
  return parsed
}
