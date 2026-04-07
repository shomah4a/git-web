import type { RepoInfoDto } from '@git-web/common'
import type { GitClient } from '../domain/ports/git-client.js'
import type { Handler } from '../http/router.js'

/**
 * GET /api/repo のハンドラファクトリ。
 *
 * GitClient を受け取り、リポジトリのトップレベルと HEAD を取得して
 * RepoInfoDto として JSON 返却する Handler を生成する。
 *
 * 責務分離 (service/controller の切り出し + ドメインモデル経由化) は
 * 後続ステップで行う。本ステップでは DTO 名のリネーム反映のみ。
 */
export function createRepoHandler(git: GitClient): Handler {
  return async () => {
    const [cwd, head] = await Promise.all([git.repoRoot(), git.head()])
    const body: RepoInfoDto = { cwd, head }
    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // HEAD SHA はリポジトリの状態に応じて変動するためキャッシュ禁止
        'cache-control': 'no-store',
      },
      body: JSON.stringify(body),
    }
  }
}
