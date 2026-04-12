/**
 * /api/refs のクエリパラメータをパースするドメイン関数 (ADR 0018, ADR 0032)。
 *
 * 入力検査:
 * - q: 長さ 0〜255、制御文字禁止 (省略可)
 *
 * 失敗時は InvalidRefsQueryError を throw する。
 */

import { InvalidRefsQueryError } from './errors.js'
import type { RefsQuery } from './refs.js'

const MAX_Q_LENGTH = 255

export function parseRefsQuery(qRaw: string | null): RefsQuery {
  const q = qRaw ?? ''
  if (q.length > MAX_Q_LENGTH) {
    throw new InvalidRefsQueryError(
      `q too long (${q.length.toString()} > ${MAX_Q_LENGTH.toString()})`,
    )
  }
  if (containsControlChars(q)) {
    throw new InvalidRefsQueryError('q contains control characters')
  }

  return { q }
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
