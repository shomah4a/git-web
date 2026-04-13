/**
 * ドメインが宣言する git 操作の port。
 *
 * - 実装は adapter 層 (adapter/git/cli-client.ts) に置く
 * - service は本 interface のみに依存し、具体的な CLI 呼び出しや
 *   引数形式を知らない
 * - テストでは本 interface をオブジェクトリテラルでフェイクしてよい
 */
export interface GitClient {
  /**
   * HEAD が指すコミットのショートハッシュを返す。
   */
  head(): Promise<string>

  /**
   * リポジトリのトップレベル絶対パスを返す。
   * cwd がリポジトリ内でない場合は例外を投げる。
   */
  repoRoot(): Promise<string>
}
