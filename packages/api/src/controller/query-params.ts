/**
 * controller 層共通のクエリパース関数 (ADR 0011)。
 *
 * 設計方針:
 * - 単純な共通パターン (rev / path) を 1 箇所に集約し、コピペによるドリフトを防ぐ
 * - バリデーション本体は domain (parseRevision / parseDiffPath) 側に置き、
 *   ここは「クエリキーの有無 / 空文字の解釈」のみを担当する
 */

import { parseDiffPath } from '../domain/diff-path.js'
import { InvalidWorktreeNameError } from '../domain/errors.js'
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

/**
 * wt クエリのパース (ADR 0055 §7-1)。
 *
 * - キーが無い / 空文字: default worktree 指定として null を返す
 * - キーあり: 文字制約 (URL-safe basename) を満たすか検証する。失敗時は throw
 *
 * 解決自体は resolver の責務であり、本関数は **入力検証** のみを行う。
 */
export function parseWtParam(params: URLSearchParams): string | null {
  const raw = params.get('wt')
  if (raw === null || raw === '') {
    return null
  }
  if (!isValidWtName(raw)) {
    throw new InvalidWorktreeNameError(raw)
  }
  return raw
}

const WT_NAME_MAX_LENGTH = 256

/**
 * `wt` 識別子の形式検証 (ADR 0055 §7-1)。
 *
 * - 1..256 文字
 * - `/`, `\`, `\0`, `..` を含まない
 * - 制御文字 (C0 / C1) を含まない
 * - URL-safe な basename を想定するが、日本語など Unicode 文字は許容する
 *   (URL は percent-encode 前提)
 *
 * 注: resolver の name の最終的な authoritative source は
 * `git worktree list --porcelain` の結果。本関数はあくまで「明らかに不正な
 * 入力を controller 段で fail-fast する」だけの一次フィルタ。
 */
export function isValidWtName(name: string): boolean {
  if (name.length === 0 || name.length > WT_NAME_MAX_LENGTH) return false
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false
  if (name.includes('..')) return false
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false
  }
  return true
}
