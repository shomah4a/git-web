/**
 * diff 対象の path パラメータのバリデーション。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0012):
 * - 受け取った入力は unknown 由来なのでこの関数で narrow する
 * - 危険な形式はすべて InvalidDiffPathError で拒否する
 * - 受け取る path は「ファイルリストエンドポイントで返ったパス」である前提だが
 *   サーバーは state を持たないため形式チェックのみ行う
 */

import { InvalidDiffPathError } from './errors.js'

const MAX_PATH_LENGTH = 4096

/**
 * path 文字列を検証して返す。
 *
 * 拒否する形式:
 * - 空文字列
 * - 4096 文字超
 * - 絶対パス (先頭が "/")
 * - ".." を含む
 * - NUL バイト (U+0000) を含む
 * - バックスラッシュを含む (Windows パス事故防止)
 * - "//" 連続スラッシュ
 * - 制御文字 (U+0000〜U+001F) を含む
 */
export function parseDiffPath(input: string): string {
  if (input === '') {
    throw new InvalidDiffPathError(input, 'empty path')
  }
  if (input.length > MAX_PATH_LENGTH) {
    throw new InvalidDiffPathError(input, 'path too long')
  }
  if (input.startsWith('/')) {
    throw new InvalidDiffPathError(input, 'absolute path')
  }
  if (input.includes('..')) {
    throw new InvalidDiffPathError(input, 'contains ..')
  }
  if (input.includes('\\')) {
    throw new InvalidDiffPathError(input, 'contains backslash')
  }
  if (input.includes('//')) {
    throw new InvalidDiffPathError(input, 'consecutive slashes')
  }
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code < 0x20) {
      throw new InvalidDiffPathError(input, 'contains control character')
    }
  }
  return input
}
