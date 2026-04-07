/**
 * diff 関連の git 操作を提供する port。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - head() / repoRoot() を持つ既存 GitClient とは分離した別 port として定義する
 *   ことで、repo 系 service / controller は diff メソッドの存在を知らない
 * - 実装 (adapter/git/cli-client.ts の CliGitClient) は両 port を implements する
 * - service 層は本 port に依存し、実 CLI の引数形式を知らない
 */

import type { DiffFileSummary } from '../diff.js'
import type { DiffRange } from '../diff-range.js'

export interface GitDiffClient {
  /**
   * 指定した範囲の diff に含まれる全ファイルの要約を返す。
   *
   * 内部実装は `git diff --raw -z` と `git diff --numstat -z` を 2 回呼んで
   * 結果を path キーでマージする。
   *
   * 範囲内に変更がない場合は空配列を返す。
   */
  diffSummary(range: DiffRange): Promise<ReadonlyArray<DiffFileSummary>>

  /**
   * 指定した範囲の個別ファイルの unified diff テキストを返す。
   *
   * 内部実装は `git diff <range> -- <path>` を呼ぶ。
   * 範囲内に対象 path の変更がない場合、または対象 path が存在しない場合は
   * 空文字列を返す。呼び出し側がそのケースを 404 にマップする責務を持つ。
   */
  diffFile(range: DiffRange, path: string): Promise<string>
}
