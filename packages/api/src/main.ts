/**
 * api パッケージのエントリポイント。
 *
 * process.cwd() を対象リポジトリとして CliGitClient を組み立て、
 * ルートを束ねた HTTP サーバーを 127.0.0.1 にリッスンする。
 *
 * bin/git-web から Node 直で起動されることを想定する。
 */

import process from 'node:process'
import { CliGitClient } from './git.js'
import { createRepoHandler } from './handlers/repo.js'
import type { Route } from './router.js'
import { createApiServer, listen } from './server.js'

async function main(): Promise<void> {
  const cwd = process.cwd()
  const git = new CliGitClient(cwd)

  // 起動時に対象が git リポジトリかを確認する。
  // リポジトリ外なら即エラー終了（ADR 0009: 対象は cwd 固定）。
  let repoRoot: string
  try {
    repoRoot = await git.repoRoot()
  } catch {
    console.error(`not a git repository: ${cwd}`)
    process.exit(1)
  }

  const routes: ReadonlyArray<Route> = [
    { method: 'GET', path: '/api/repo', handler: createRepoHandler(git) },
  ]

  const server = createApiServer({ routes })
  const addr = await listen(server, '127.0.0.1', 0)
  const url = `http://${addr.host}:${addr.port.toString()}`
  console.log(`git-web api listening on ${url}`)
  console.log(`target repository: ${repoRoot}`)
}

void main()
