/**
 * ドメイン例外の基底クラスとサブクラス。
 *
 * 設計方針:
 * - ドメイン層で発生しうる想定内エラーは本ファイルのクラスを throw する
 * - controller 層の error-mapper が instanceof で HTTP ステータスに
 *   マッピングする
 * - 想定外エラーは通常の Error のまま throw され、http 層で 500 になる
 * - 本層は HTTP に依存しない (ステータスコード等は持たない)
 */

/**
 * ドメイン例外の基底クラス。
 *
 * このクラス自体は直接 throw しない。必ずサブクラスを定義して投げる。
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * 指定された作業ディレクトリが git リポジトリではないことを表す例外。
 *
 * - message 文字列は従来の互換性のため `not a git repository: ${cwd}`
 *   形式を維持する
 * - start() の事前チェックで投げられる。HTTP 経路で投げられることは現状なし
 */
export class NotAGitRepositoryError extends DomainError {
  readonly cwd: string

  constructor(cwd: string) {
    super(`not a git repository: ${cwd}`)
    this.cwd = cwd
  }
}
