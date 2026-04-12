/**
 * ref 一覧取得の port (ADR 0018, ADR 0032)。
 *
 * - refs-service が本 interface のみに依存する
 * - 実装は adapter/git/cli-client.ts (CliGitClient)
 * - branches / tags: `git for-each-ref --format='%(refname:short)'
 *   refs/heads refs/tags` を分解した結果
 * - フィルタは本 port の責務ではなく、service 層で行う
 * - ADR 0032: headRef() は撤廃
 */
export interface GitRefsClient {
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
