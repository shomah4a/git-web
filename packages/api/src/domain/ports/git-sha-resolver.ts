/**
 * リビジョンを 40 桁 commit SHA に解決する port (ADR 0057)。
 *
 * - レビューコメントのアンカーは ref 文字列ではなく解決済みの 40 桁 SHA を用いる
 *   (ref は動くため)。本 port はその解決を提供する
 * - 実装は adapter/git/cli-client.ts。`git rev-parse` で commit に peel する
 * - 解決できない rev (存在しない / commit でない) は例外を投げる
 */

import type { Revision } from '../revision.js'

export interface GitShaResolver {
  /**
   * リビジョンを 40 桁 commit SHA へ解決する。
   * annotated tag 等は commit に peel する。解決不能なら例外を投げる。
   */
  resolveCommitSha(rev: Revision): Promise<string>
}
