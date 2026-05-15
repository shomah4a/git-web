/**
 * diff / blob エンドポイント共通の path パラメータのバリデーション。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0012 / ADR 0016):
 * - 受け取った入力は unknown 由来なのでこの関数で narrow する
 * - 危険な形式はすべて InvalidDiffPathError で拒否する
 * - diff 経路では「ファイルリストエンドポイントで返ったパス」である前提だが
 *   blob 経路ではクライアントが任意 path を指定する入口となる
 * - サーバーは state を持たないため形式チェックのみ行う (realpath 境界検査は
 *   worktree adapter 側で別途実施)
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
 * - segment が ".." に完全一致するものを含む (ADR 0016: 部分一致ではなく
 *   segment ベース。`foo..bar` のような正規ファイル名は許可する)
 * - segment が ".git" に完全一致するものを含む (ADR 0055 §7-5: linked
 *   worktree の `.git` ファイル / `.git/worktrees/<name>/` 配下への blob
 *   経由アクセスを遮断する。`.gitignore` のような正規ファイルは部分一致
 *   ではなく segment 一致なので影響しない)
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
  const segments = input.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new InvalidDiffPathError(input, 'contains parent segment')
  }
  if (segments.some((segment) => segment === '.git')) {
    throw new InvalidDiffPathError(input, 'contains .git segment')
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
