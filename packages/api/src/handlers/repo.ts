import type { RepoInfo } from '@git-web/common'
import type { GitClient } from '../git.js'
import type { Handler } from '../router.js'

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
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }
  }
}
