/**
 * ドメインが宣言するツリー取得の port (ADR 0022)。
 *
 * - 実装は adapter 層 (adapter/git/cli-client.ts) に置く
 * - service は本 interface のみに依存し、具体的な CLI 呼び出しを知らない
 */

import type { Revision } from '../revision.js'
import type { TreeEntry } from '../tree.js'

export interface GitTreeClient {
  /**
   * 指定リビジョン・パス配下のツリーエントリ一覧を返す。
   *
   * @param rev 対象リビジョン
   * @param path リポジトリルートからの相対パス (空文字 = ルート)
   */
  listTree(rev: Revision, path: string): Promise<ReadonlyArray<TreeEntry>>
}
