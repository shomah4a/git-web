import type { RepoInfoDto } from '@git-web/common'
import type { GitClient } from '../domain/ports/git-client.js'
import type { RepoInfo } from '../domain/repo.js'
import type { Handler } from '../http/router.js'
import { getRepoInfo } from '../service/repo-service.js'

/**
 * GET /api/repo のハンドラファクトリ。
 *
 * 設計方針 (ADR 0011):
 * - service (getRepoInfo) を呼んでドメインモデルを取得する
 * - ドメインモデル RepoInfo を DTO RepoInfoDto に変換してから JSON 化する
 * - 変換は object literal で書き、`as` を使わない (ADR 0010)
 */
export function createRepoHandler(git: GitClient): Handler {
  return async () => {
    const info = await getRepoInfo(git)
    const body: RepoInfoDto = toRepoInfoDto(info)
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

/**
 * RepoInfo ドメインモデルを RepoInfoDto に変換するシリアライザ。
 *
 * 現状はドメインモデルと DTO が構造同型のため写像は素通しだが、
 * 将来ドメインモデルに振る舞い (getter 等) が増えても DTO 側を
 * 安定させるため、明示的な object literal で書く。
 */
function toRepoInfoDto(info: RepoInfo): RepoInfoDto {
  return {
    cwd: info.cwd,
    head: info.head,
  }
}
