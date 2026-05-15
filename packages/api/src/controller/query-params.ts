/**
 * controller 層共通のクエリパース関数 (ADR 0011)。
 *
 * 設計方針:
 * - 単純な共通パターン (rev / path) を 1 箇所に集約し、コピペによるドリフトを防ぐ
 * - バリデーション本体は domain (parseRevision / parseDiffPath) 側に置き、
 *   ここは「クエリキーの有無 / 空文字の解釈」のみを担当する
 */

import { parseDiffPath } from '../domain/diff-path.js'
import type { Revision } from '../domain/revision.js'
import { parseRevision } from '../domain/revision.js'

/**
 * rev クエリのパース。
 *
 * - キー自体が無い: worktree 指定として null を返す
 * - キーあり (空文字含む): parseRevision に渡す
 */
export function parseRevParam(params: URLSearchParams): Revision | null {
  if (!params.has('rev')) {
    return null
  }
  const raw = params.get('rev') ?? ''
  return parseRevision(raw)
}

/**
 * path クエリのパース。
 *
 * - キーが無い / 空文字: ルートディレクトリ (空文字) を返す
 * - キーあり: parseDiffPath で検証
 */
export function parsePathParam(params: URLSearchParams): string {
  const raw = params.get('path')
  if (raw === null || raw === '') {
    return ''
  }
  return parseDiffPath(raw)
}
