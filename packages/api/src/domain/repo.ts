/**
 * 対象 git リポジトリの基本情報を表すドメインモデル。
 *
 * 設計方針: ADR 0011 に従い、ドメインモデルは DTO とは別に定義する。
 * 現状は構造同型 (cwd: string, head: string) だが、wire format との
 * 境界を型システムで表現するため独立した型として宣言する。
 *
 * 振る舞い (メソッド) が必要になった時点で class 化する。
 */
export type HeadInfo = {
  readonly commitHash: string
  readonly branch: string | null
}

export type RepoInfo = {
  readonly name: string
  readonly cwd: string
  readonly head: HeadInfo
}
