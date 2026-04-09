/**
 * ref 一覧取得の port (ADR 0018)。
 *
 * - refs-service が本 interface のみに依存する
 * - 実装は adapter/git/cli-client.ts (CliGitClient)
 * - head: `git symbolic-ref --short HEAD` 相当。空リポジトリ (unborn HEAD) や
 *   detached HEAD の場合は null を返す契約
 * - branches / tags: `git for-each-ref --format='%(refname:short)'
 *   refs/heads refs/tags` を分解した結果
 * - フィルタや切り詰めは本 port の責務ではなく、service 層で行う
 */
export interface GitRefsClient {
  /**
   * HEAD の象徴名 (ブランチ名) を返す。
   *
   * - 通常は `main` のような短い名前
   * - 空リポジトリ (unborn HEAD) / detached HEAD の場合は null
   */
  headRef(): Promise<string | null>

  /**
   * ローカルブランチの短縮名 (`refname:short`) の一覧を返す。
   * for-each-ref のデフォルト順 (refname 昇順)。
   */
  listBranches(): Promise<ReadonlyArray<string>>

  /**
   * タグの短縮名 (`refname:short`) の一覧を返す。
   * for-each-ref のデフォルト順 (refname 昇順)。
   */
  listTags(): Promise<ReadonlyArray<string>>
}
