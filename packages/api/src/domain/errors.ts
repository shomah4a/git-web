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
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

/**
 * 指定された作業ディレクトリが git リポジトリではないことを表す例外。
 *
 * - message 文字列は従来の互換性のため `not a git repository: ${cwd}`
 *   形式を維持する
 * - start() の事前チェックで投げられる。HTTP 経路で投げられることは現状なし
 * - 元の git CLI エラーを cause に保持して原因の追跡を可能にする
 */
export class NotAGitRepositoryError extends DomainError {
  readonly cwd: string

  constructor(cwd: string, options?: { readonly cause?: unknown }) {
    super(`not a git repository: ${cwd}`, options)
    this.cwd = cwd
  }
}

/**
 * InvalidRevisionError が拒否理由を表すタグ。
 *
 * - empty: 空文字列
 * - too-long: 255 文字超
 * - forbidden-chars: 制御文字 / シェルメタ / NUL など
 * - reflog-form: HEAD@{N} などの reflog 形式 (非ゴール)
 * - bad-modifier: `^` / `~` の連結部が不正 (`HEAD^10` / `HEAD~1000` など)
 * - shape: base 部分 (ref 名 / HEAD) の形として成立しない
 */
export type InvalidRevisionReason =
  | 'empty'
  | 'too-long'
  | 'forbidden-chars'
  | 'reflog-form'
  | 'bad-modifier'
  | 'shape'

/**
 * クライアントから渡されたリビジョン文字列がバリデーションに失敗したことを
 * 表す例外。
 *
 * ADR 0009 §2 / ADR 0018 の許可リスト方式に従い、許可されない形式の入力は
 * このエラーで拒否する。controller の error-mapper で 400 にマップされる。
 *
 * reason は後続 UI (タスク B) で入力欄のエラーメッセージを分岐するために持つ。
 */
export class InvalidRevisionError extends DomainError {
  readonly input: string
  readonly reason: InvalidRevisionReason

  constructor(input: string, reason: InvalidRevisionReason) {
    super(`invalid revision (${reason}): ${input}`)
    this.input = input
    this.reason = reason
  }
}

/**
 * クライアントから渡された diff の from / to パラメータの組み合わせが
 * 不正であることを表す例外。
 *
 * 具体的には「to だけが指定され from が無い」ケースでのみ投げられる。
 * 各 from / to の形式自体の不正は InvalidRevisionError を使う。
 */
export class InvalidDiffRangeError extends DomainError {
  readonly reason: string

  constructor(reason: string) {
    super(`invalid diff range: ${reason}`)
    this.reason = reason
  }
}

/**
 * /api/refs クエリパラメータがバリデーションに失敗したことを表す例外。
 *
 * ADR 0018 の q / limit 制約を満たさない入力はこのエラーで拒否する。
 * controller の error-mapper で 400 にマップされる。
 */
export class InvalidRefsQueryError extends DomainError {
  readonly reason: string

  constructor(reason: string) {
    super(`invalid refs query: ${reason}`)
    this.reason = reason
  }
}

/**
 * クライアントから渡された diff 対象の path がバリデーションに失敗したことを
 * 表す例外。
 *
 * 以下のいずれかに該当する場合に投げられる:
 * - 空文字列
 * - 絶対パス (先頭が "/")
 * - ".." を含む
 * - NUL バイト / 制御文字を含む
 * - バックスラッシュを含む
 * - 連続スラッシュ "//" を含む
 * - 4096 文字超
 *
 * controller の error-mapper で 400 にマップされる。
 */
export class InvalidDiffPathError extends DomainError {
  readonly input: string
  readonly reason: string

  constructor(input: string, reason: string) {
    super(`invalid diff path: ${reason}`)
    this.input = input
    this.reason = reason
  }
}
