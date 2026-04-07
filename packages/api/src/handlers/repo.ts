import type { RepoInfo } from '@git-web/common'
import type { GitClient } from '../domain/ports/git-client.js'
import type { Handler } from '../http/router.js'

/**
 * GET /api/repo のハンドラファクトリ。
 *
 * GitClient を受け取り、リポジトリのトップレベルと HEAD を取得して
 * RepoInfo として JSON 返却する Handler を生成する。
 */
export function createRepoHandler(git: GitClient): Handler {
  return async () => {
    const [cwd, head] = await Promise.all([git.repoRoot(), git.head()])
    const body: RepoInfo = { cwd, head }
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
