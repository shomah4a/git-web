/**
 * ツリー表示の DTO (ADR 0022, ADR 0026)。
 */

import type { EntryBaseDto, EntryTypeDto } from './entry-base.js'

/**
 * ツリーエントリの種別。
 */
export type TreeEntryTypeDto = EntryTypeDto

/**
 * ファイルの git 状態。worktree 参照時のみ値が入り、rev 指定時は null。
 */
export type TreeEntryStatusDto = 'added' | 'modified' | 'deleted' | 'untracked' | null

/**
 * ツリーエントリ 1 件の DTO。
 */
export type TreeEntryDto = EntryBaseDto & {
  readonly status: TreeEntryStatusDto
}

/**
 * /api/tree レスポンス DTO。
 */
export type TreeResponseDto = {
  readonly entries: ReadonlyArray<TreeEntryDto>
}
