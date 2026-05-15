/**
 * worktree 一覧の DTO (ADR 0055)。
 *
 * `GET /api/worktrees` で返す情報。
 * 本リポジトリで git worktree add された linked worktree と main worktree を
 * 一覧化する。
 */

/**
 * worktree 1 件分の表示用情報。
 */
export type WorktreeListItemDto = {
  /**
   * URL `wt` クエリ・API リクエストで使う識別子。
   * 通常は worktree path の basename。衝突がある場合は接尾辞を付けて一意化する (ADR 0055 §5)。
   */
  readonly name: string

  /**
   * worktree 絶対パス。realpath 解決済み。
   * 表示用途のみ。クライアントが API リクエストにこの値を送ることはない。
   */
  readonly path: string

  /**
   * HEAD コミットの 40 桁 hex ハッシュ。
   */
  readonly headHash: string

  /**
   * HEAD が指しているブランチ名 (例: `feat/foo`)。detached HEAD の場合は null。
   * `refs/heads/` 接頭辞は除去済み。
   */
  readonly branch: string | null

  /**
   * detached HEAD であるかどうか。
   */
  readonly isDetached: boolean

  /**
   * git-web を起動した cwd と一致する worktree であれば true。
   * 「現在選択中の worktree」ではなく「`wt` 未指定時のデフォルト」を意味する (ADR 0055)。
   */
  readonly isDefault: boolean

  /**
   * main worktree であれば true (`.git` ディレクトリそのものを持つ worktree)。
   * 一覧表示上の区別だけに使う。
   */
  readonly isMain: boolean
}

/**
 * `GET /api/worktrees` レスポンス。
 *
 * bare worktree / submodule worktree は除外済み (ADR 0055 §6)。
 */
export type WorktreesListResponseDto = {
  readonly items: ReadonlyArray<WorktreeListItemDto>
}
