/**
 * ツリー表示の DTO (ADR 0022)。
 */

/**
 * ツリーエントリの種別。
 */
export type TreeEntryTypeDto = 'blob' | 'tree'

/**
 * ファイルの git 状態。worktree 参照時のみ値が入り、rev 指定時は null。
 */
export type TreeEntryStatusDto = 'added' | 'modified' | 'deleted' | 'untracked' | null

/**
 * ツリーエントリ 1 件の DTO。
 */
export type TreeEntryDto = {
  readonly name: string
  readonly path: string
  readonly type: TreeEntryTypeDto
  readonly status: TreeEntryStatusDto
  readonly mode: string | null
  readonly size: number | null
}

/**
 * /api/tree レスポンス DTO。
 */
export type TreeResponseDto = {
  readonly entries: ReadonlyArray<TreeEntryDto>
}
