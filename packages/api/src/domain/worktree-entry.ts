/**
 * worktree エントリのドメインモデル (ADR 0023)。
 *
 * リビジョンツリー用の TreeEntry とは関心事が異なるため分離する。
 * worktree 固有のメタデータ (mode, size) と変更状態 (status) を持つ。
 */

/**
 * エントリの種別。
 */
export type WorktreeEntryType = 'blob' | 'tree'

/**
 * ファイルの git 状態。
 *
 * - 'added': ステージ済みの新規ファイル
 * - 'modified': 変更あり (staged / unstaged 問わず)
 * - 'deleted': 削除済み
 * - 'untracked': git 管理外 (.gitignore 対象ではない新規)
 * - 'ignored': .gitignore で除外されているが作業ツリーに存在 (ADR 0055)
 * - null: 状態なし (変更なし)
 */
export type WorktreeEntryStatus = 'added' | 'modified' | 'deleted' | 'untracked' | 'ignored' | null

/**
 * worktree の 1 エントリ。
 */
export type WorktreeEntry = {
  readonly status: WorktreeEntryStatus
  readonly name: string
  readonly path: string
  readonly type: WorktreeEntryType
  readonly mode: string | null
  readonly size: number | null
}
