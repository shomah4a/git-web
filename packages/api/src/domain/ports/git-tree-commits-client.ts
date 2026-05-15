/**
 * ツリービューのファイル単位最終コミット取得 port (ADR 0054)。
 *
 * 設計方針:
 * - 既存 GitLogClient とは出力形式 (--name-only) とユースケース (集合演算・早期終了)
 *   が大きく異なるため独立 port として切る
 * - 実装は adapter/git/cli-client.ts の CliGitClient が implements する
 * - service 層は本 port に依存し、git コマンドの引数形式を知らない
 */

import type { Revision } from '../revision.js'

/**
 * 1 エントリの最終コミット情報。
 *
 * - hash: 40 桁 SHA-1
 * - date: UNIX epoch 秒 (タイムゾーン独立)
 * - subject: コミット subject (1 行目)
 */
export type LastCommitInfo = {
  readonly hash: string
  readonly date: number
  readonly subject: string
}

export interface GitTreeCommitsClient {
  /**
   * 指定 dir 直下の各 name について最終コミット情報を返す。
   *
   * - dir: リポジトリルートからの相対パス。空文字でルート
   * - targetNames: 対象 immediate children の名前集合 (集合演算と早期終了に利用)
   * - maxCount: git log 走査の上限件数 (ADR 0054 暴走防止)
   *
   * 履歴に現れなかった name は返却 Map に含めない (呼び出し側で null とみなす)。
   */
  lastCommitsByName(
    rev: Revision,
    dir: string,
    targetNames: ReadonlySet<string>,
    maxCount: number,
  ): Promise<ReadonlyMap<string, LastCommitInfo>>
}
