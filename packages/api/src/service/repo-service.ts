/**
 * 対象リポジトリの基本情報を取得するユースケース。
 *
 * 設計方針:
 * - GitClient (domain port) を引数で受け取る (副作用の外部化)
 * - 戻り値はドメインモデル RepoInfo。DTO 変換は controller の責務
 * - HTTP / フレームワーク / DTO に依存しない
 */

import * as path from 'node:path'

import type { GitClient } from '../domain/ports/git-client.js'
import type { RepoInfo } from '../domain/repo.js'

/**
 * GitClient を介して対象リポジトリの作業ディレクトリと HEAD を取得し、
 * RepoInfo ドメインモデルとして返す。
 *
 * name はリポジトリルートのディレクトリ名を使用する。
 * ルートディレクトリ (`/`) の場合は cwd をそのまま使用する。
 */
export async function getRepoInfo(git: GitClient): Promise<RepoInfo> {
  const [cwd, head] = await Promise.all([git.repoRoot(), git.head()])
  const basename = path.basename(cwd)
  const name = basename === '' ? cwd : basename
  return { name, cwd, head }
}
