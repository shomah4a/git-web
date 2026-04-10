/**
 * worktree 表示の DTO (ADR 0023, ADR 0026)。
 *
 * worktree 専用の画面・API で使用する。
 * リビジョンツリー用の TreeEntryDto とは関心事が異なるため分離するが、
 * 共通フィールドは EntryBaseDto から継承する。
 */

import type { EntryBaseDto, EntryTypeDto } from './entry-base.js'

/**
 * ファイルの git 状態。
 */
export type WorktreeEntryStatusDto = 'added' | 'modified' | 'deleted' | 'untracked' | null

/**
 * エントリの種別。
 */
export type WorktreeEntryTypeDto = EntryTypeDto

/**
 * worktree エントリ 1 件の DTO。
 */
export type WorktreeEntryDto = EntryBaseDto & {
  readonly status: WorktreeEntryStatusDto
}

/**
 * /api/worktree レスポンス DTO。
 */
export type WorktreeResponseDto = {
  readonly entries: ReadonlyArray<WorktreeEntryDto>
}
