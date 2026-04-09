/**
 * リビジョン文字列の値オブジェクト。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0012 §5 / ADR 0018):
 * - クライアントから受け取ったリビジョン文字列は本ファイルの parseRevision で
 *   バリデーションし、Revision 型に包んでから git に渡す
 * - 許可リスト方式:
 *   - SHA (4〜40 文字の 0-9a-f)
 *   - base + modifier* 形式
 *     - base: "HEAD" または refname (ブランチ名/タグ名/refs/heads/... 等)
 *     - modifier: "^" / "^N" / "~N" の連結
 * - Revision 型を持っている = git 引数として安全に渡せることが保証される
 * - 二層防御として CLI 側 (adapter/git/cli-client.ts) で
 *   `git diff --end-of-options ...` 形式を使い、バリデーション崩れでも
 *   引数がフラグとして解釈されないようにする
 */

import { InvalidRevisionError, type InvalidRevisionReason } from './errors.js'

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

/**
 * refname 本体 (HEAD と modifier を除いた部分) に許可する形。
 *
 * 制約:
 * - 先頭 1 文字は英数 / `_` / `.` のいずれか (先頭 `-` `/` を禁止するため)
 * - 2 文字目以降は英数 / `_` / `.` / `/` / `-`
 * - 全体長 1〜255 (ここでは 1 + 0〜254 = 1〜255)
 *
 * 追加の禁止条件は parseNamedRevision 内で個別に判定する:
 * - `..` を含まない
 * - `@{` を含まない
 * - `//` を含まない
 * - 末尾 `/`
 * - 末尾 `.lock`
 * - 制御文字
 */
const REFNAME_BODY_PATTERN = /^[A-Za-z0-9_.][A-Za-z0-9_./-]{0,254}$/

/**
 * modifier 全体 (連結) に許可する形。
 *
 * modifier   := "^" | "^" digit | "~" digit{1,3}
 * modifier 列は ^^^ や ~3 や ^2~1 のように連結可能。
 *
 * 正規表現は非キャプチャグループの繰り返しで、^ の後に任意 1 桁数字、
 * または ~ の後に 1〜3 桁数字を受け入れる。
 */
const MODIFIER_SUFFIX_PATTERN = /^(?:\^\d?|~\d{1,3})*$/

/**
 * リビジョン文字列を検証して Revision 型に包む。
 *
 * 詳細な文法は ADR 0018 を参照。
 *
 * 許可しない形式の場合は InvalidRevisionError (reason 付き) を throw する。
 */
export function parseRevision(input: string): Revision {
  if (input.length === 0) {
    throw new InvalidRevisionError(input, 'empty')
  }
  if (input.length > 255) {
    throw new InvalidRevisionError(input, 'too-long')
  }
  if (input.includes('@{')) {
    // reflog 形式 (HEAD@{N}) は非ゴール
    // forbidden-chars 判定より先に見る (`{` は forbidden に含まれるため)
    throw new InvalidRevisionError(input, 'reflog-form')
  }
  if (containsForbiddenChars(input)) {
    throw new InvalidRevisionError(input, 'forbidden-chars')
  }

  if (SHA_PATTERN.test(input)) {
    return { raw: input }
  }

  const { base, modifier } = splitBaseAndModifier(input)

  if (base.length === 0) {
    throw new InvalidRevisionError(input, 'shape')
  }

  if (!isValidBase(base)) {
    throw new InvalidRevisionError(input, 'shape')
  }

  if (!MODIFIER_SUFFIX_PATTERN.test(modifier)) {
    throw new InvalidRevisionError(input, 'bad-modifier')
  }

  return { raw: input }
}

/**
 * 制御文字 (C0 + DEL) とシェルメタ文字の一部を検査する。
 *
 * 正規表現の文法エラー検出より先にここで弾いておき、
 * reason を 'forbidden-chars' に統一する。
 */
function containsForbiddenChars(input: string): boolean {
  // eslint-disable 相当の抑制は使わず、明示的に文字コード範囲で判定する
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  // refname に出現させたくないシェルメタ/区切り文字
  // `^` `~` は modifier で使うので除外
  const forbidden = [
    ' ',
    '\t',
    ';',
    '&',
    '|',
    '`',
    '$',
    '(',
    ')',
    '<',
    '>',
    '"',
    "'",
    '\\',
    '?',
    '*',
    '[',
    ']',
    '{',
    '}',
    ':',
  ]
  for (const ch of forbidden) {
    if (input.includes(ch)) {
      return true
    }
  }
  return false
}

/**
 * 先頭から base 部分 (HEAD または refname) を切り出す。
 *
 * modifier は `^` か `~` で始まるので、最初に現れる `^` または `~` より前を base とする。
 */
function splitBaseAndModifier(input: string): { base: string; modifier: string } {
  let splitAt = input.length
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i)
    if (ch === '^' || ch === '~') {
      splitAt = i
      break
    }
  }
  return { base: input.slice(0, splitAt), modifier: input.slice(splitAt) }
}

/**
 * base (HEAD または refname) の形式を検査する。
 */
function isValidBase(base: string): boolean {
  if (base === 'HEAD') {
    return true
  }
  if (!REFNAME_BODY_PATTERN.test(base)) {
    return false
  }
  if (base.includes('..')) {
    return false
  }
  if (base.includes('//')) {
    return false
  }
  if (base.endsWith('/')) {
    return false
  }
  if (base.endsWith('.lock')) {
    return false
  }
  return true
}

export type { InvalidRevisionReason }
