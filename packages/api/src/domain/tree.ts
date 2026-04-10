/**
 * ディレクトリツリーのドメインモデル (ADR 0022)。
 *
 * git ls-tree や git ls-files + git status の結果を統一的に表現する。
 */

/**
 * ツリーエントリの種別。
 *
 * - 'blob': ファイル
 * - 'tree': ディレクトリ
 */
export type TreeEntryType = 'blob' | 'tree'

/**
 * ファイルの git 状態 (worktree 参照時のみ)。
 *
 * - 'added': ステージ済みの新規ファイル
 * - 'modified': 変更あり (staged / unstaged 問わず)
 * - 'deleted': 削除済み
 * - 'untracked': git 管理外 (.gitignore 対象は除外済み)
 * - null: 状態なし (変更なし or rev 指定時)
 */
export type TreeEntryStatus = 'added' | 'modified' | 'deleted' | 'untracked' | null

/**
 * ディレクトリツリーの 1 エントリ。
 *
 * - name: エントリ名 (ファイル名 / ディレクトリ名)
 * - path: リポジトリルートからの相対パス
 * - type: blob (ファイル) または tree (ディレクトリ)
 * - status: git 状態 (worktree 時のみ、rev 指定時は null)
 */
export type TreeEntry = {
  readonly name: string
  readonly path: string
  readonly type: TreeEntryType
  readonly status: TreeEntryStatus
}
