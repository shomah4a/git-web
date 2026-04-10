/**
 * worktree 表示の DTO (ADR 0023)。
 *
 * worktree 専用の画面・API で使用する。
 * リビジョンツリー用の TreeEntryDto とは関心事が異なるため分離する。
 */

/**
 * ファイルの git 状態。
 */
export type WorktreeEntryStatusDto = 'added' | 'modified' | 'deleted' | 'untracked' | null

/**
 * エントリの種別。
 */
export type WorktreeEntryTypeDto = 'blob' | 'tree'

/**
 * worktree エントリ 1 件の DTO。
 */
export type WorktreeEntryDto = {
  readonly status: WorktreeEntryStatusDto
  readonly name: string
  readonly path: string
  readonly type: WorktreeEntryTypeDto
  readonly mode: string | null
  readonly size: number | null
}

/**
 * /api/worktree レスポンス DTO。
 */
export type WorktreeResponseDto = {
  readonly entries: ReadonlyArray<WorktreeEntryDto>
}
