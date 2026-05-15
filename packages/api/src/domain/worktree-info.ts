/**
 * `git worktree list --porcelain` の解析結果を保持するドメインモデル (ADR 0055)。
 *
 * worktrees-list-service / worktree-resolver が利用する。
 * DTO ではないため `@git-web/common` には置かない。
 */

export type WorktreeInfo = {
  /**
   * `worktree <path>` 行で得た絶対パス。porcelain は realpath 化されていない
   * (symlink そのまま) ので、後段で realpath 解決する。
   */
  readonly path: string

  /**
   * `HEAD <hash>` の 40 桁 hex。新規初期化直後で HEAD が無い worktree の場合は null。
   */
  readonly headHash: string | null

  /**
   * `branch <refname>` の refname (例: `refs/heads/main`)。
   * detached HEAD / bare は null。
   */
  readonly branchRef: string | null

  /**
   * `detached` 行を持つ worktree の場合 true。
   */
  readonly isDetached: boolean

  /**
   * `bare` 行を持つ worktree の場合 true。
   * bare は通常の作業ツリーを持たないため、service 層で除外する (ADR 0055 §6)。
   */
  readonly isBare: boolean

  /**
   * `locked [<reason>]` 行を持つ worktree の場合 true。
   */
  readonly isLocked: boolean

  /**
   * `prunable [<reason>]` 行を持つ worktree の場合 true。
   */
  readonly isPrunable: boolean
}
