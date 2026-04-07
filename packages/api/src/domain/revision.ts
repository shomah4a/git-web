/**
 * リビジョン文字列の値オブジェクト。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0012):
 * - クライアントから受け取ったリビジョン文字列は本ファイルの parseRevision で
 *   バリデーションし、Revision 型に包んでから git に渡す
 * - 許可リスト方式: SHA / HEAD / HEAD~N / HEAD^ / HEAD^N のみ
 * - ブランチ名 / タグ名 / HEAD@{N} は初版では許可しない
 * - Revision 型を持っている = git 引数として安全に渡せることが保証される
 */

import { InvalidRevisionError } from './errors.js'

/**
 * バリデーション済みのリビジョン文字列。
 *
 * raw は parseRevision を通過した文字列のみが入る。
 * 直接オブジェクトリテラルで作らず parseRevision 経由で構築する。
 */
export type Revision = {
  readonly raw: string
}

const SHA_PATTERN = /^[0-9a-f]{4,40}$/
const HEAD_TILDE_PATTERN = /^HEAD~\d{1,3}$/
const HEAD_CARET_PATTERN = /^HEAD\^\d{0,1}$/

/**
 * リビジョン文字列を検証して Revision 型に包む。
 *
 * 許可する形式:
 * - 短縮または完全な SHA (4〜40 文字の 0-9a-f)
 * - "HEAD"
 * - "HEAD~N" (N は 0〜999)
 * - "HEAD^" / "HEAD^N" (N 省略可、N は 0〜9)
 *
 * 許可しない形式の場合は InvalidRevisionError を throw する。
 */
export function parseRevision(input: string): Revision {
  if (input === 'HEAD') {
    return { raw: input }
  }
  if (SHA_PATTERN.test(input)) {
    return { raw: input }
  }
  if (HEAD_TILDE_PATTERN.test(input)) {
    return { raw: input }
  }
  if (HEAD_CARET_PATTERN.test(input)) {
    return { raw: input }
  }
  throw new InvalidRevisionError(input)
}
