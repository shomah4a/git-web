/**
 * api パッケージのエントリ。
 *
 * start(options) を export し、bin/git-web から import して呼べるようにする。
 * 直接 node で起動された場合も自動で start() を呼ぶ。
 */

import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { CliGitClient } from './git.js'
import { createRepoHandler } from './handlers/repo.js'
import type { Route } from './router.js'
import { close, createApiServer, listen } from './server.js'
import { createStaticHandler } from './static.js'

export type StartOptions = {
  /**
   * 対象リポジトリのパス。未指定なら process.cwd() を使う。
   */
  readonly cwd?: string
  /**
   * リッスンするホスト。未指定なら 127.0.0.1。
   */
  readonly host?: string
  /**
   * リッスンするポート。未指定または 0 なら空きポートを自動割当。
   */
  readonly port?: number
  /**
   * 静的ファイル配信元ディレクトリ（通常は packages/front/dist）。
   * 未指定の場合は静的配信を行わない。
   */
  readonly staticDir?: string
}

export type StartedServer = {
  readonly url: string
  readonly repoRoot: string
  readonly close: () => Promise<void>
}

/**
 * api サーバーを起動する。
 *
 * - 対象が git リポジトリでない場合は Error を投げる
 * - staticDir が指定されていれば /api/* 以外はそのディレクトリから配信する
 */
export async function start(options: StartOptions = {}): Promise<StartedServer> {
  const cwd = options.cwd ?? process.cwd()
  const git = new CliGitClient(cwd)

  let repoRoot: string
  try {
    repoRoot = await git.repoRoot()
  } catch {
    throw new Error(`not a git repository: ${cwd}`)
  }

  const routes: ReadonlyArray<Route> = [
    { method: 'GET', path: '/api/repo', handler: createRepoHandler(git) },
  ]

  const server = createApiServer(
    options.staticDir !== undefined
      ? { routes, fallback: createStaticHandler({ rootDir: options.staticDir }) }
      : { routes },
  )
  const addr = await listen(server, options.host ?? '127.0.0.1', options.port ?? 0)
  const url = `http://${addr.host}:${addr.port.toString()}`

  return {
    url,
    repoRoot,
    close: () => close(server),
  }
}

/**
 * node packages/api/dist/main.js として直接起動された場合のハンドリング。
 * bin/git-web 等から import されたときは実行されない。
 * process.argv[1] と import.meta.url を正規化して比較する。
 */
const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  try {
    const started = await start()
    console.log(`git-web api listening on ${started.url}`)
    console.log(`target repository: ${started.repoRoot}`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'failed to start')
    process.exit(1)
  }
}
