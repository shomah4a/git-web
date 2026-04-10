/**
 * ディレクトリツリーのドメインモデル (ADR 0022)。
 *
 * git ls-tree や readdir の結果を統一的に表現する。
 */

/**
 * ツリーエントリの種別。
 *
 * - 'blob': ファイル
 * - 'tree': ディレクトリ
 */
export type TreeEntryType = 'blob' | 'tree'

/**
 * ディレクトリツリーの 1 エントリ。
 *
 * - name: エントリ名 (ファイル名 / ディレクトリ名)
 * - path: リポジトリルートからの相対パス
 * - type: blob (ファイル) または tree (ディレクトリ)
 */
export type TreeEntry = {
  readonly name: string
  readonly path: string
  readonly type: TreeEntryType
}
