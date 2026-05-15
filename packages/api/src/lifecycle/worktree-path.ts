/**
 * worktree 絶対パスの brand 型 (ADR 0055 §7-3)。
 *
 * 「name → path 解決を経た realpath 済みの絶対パス」のみがこの型を取り得る。
 * 生成は本ファイルの内部関数 `unsafeBuildBoundedWorktreePath` 経由のみで行い、
 * 文字列を直接アサインする経路は型レベルで遮断する。これにより、未検証の path
 * がそのまま reader / git client に届く経路を排除する。
 *
 * 実装上の brand は構造的サブタイプ用の型情報のみで、ランタイム上は単なる
 * オブジェクトである (シンボルプロパティのランタイム実体は不要)。
 */

type BoundedWorktreePathBrand = { readonly __brand: 'BoundedWorktreePath' }

export type BoundedWorktreePath = {
  readonly absolutePath: string
} & BoundedWorktreePathBrand

/**
 * Resolver / factory 内部からのみ呼ぶ生成関数。
 *
 * 呼び出し側は「realpath 済みかつ authoritative source から得た絶対パスである」
 * ことを保証する責務を負う。本関数の利用箇所はファイル名検索で監査できる。
 */
export function unsafeBuildBoundedWorktreePath(absolutePath: string): BoundedWorktreePath {
  return { absolutePath, __brand: 'BoundedWorktreePath' }
}
