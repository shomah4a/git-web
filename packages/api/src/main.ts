/**
 * api パッケージのエントリ。
 *
 * start(options) を export し、bin/git-web から import して呼べるようにする。
 * 直接 node で起動された場合も自動で start() を呼ぶ。
 */

import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { CliGitClient } from './adapter/git/cli-client.js'
import { jsdiffParser } from './adapter/jsdiff/parser.js'
import { createDiffFileHandler, createDiffFilesHandler } from './controller/diff-controller.js'
import { mapDomainErrorToHttpResponse } from './controller/error-mapper.js'
import { createRepoHandler } from './controller/repo-controller.js'
import { NotAGitRepositoryError } from './domain/errors.js'
import type { Route } from './http/router.js'
import { close, createApiServer, listen } from './http/server.js'
import { createStaticHandler } from './http/static.js'
import { createDiffService } from './service/diff-service.js'

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
 * - 対象が git リポジトリでない場合は NotAGitRepositoryError を投げる
 *   (HTTP 経路ではなく start() の事前チェック経路、ADR 0011 参照)
 * - staticDir が指定されていれば /api/* 以外はそのディレクトリから配信する
 */
export async function start(options: StartOptions = {}): Promise<StartedServer> {
  const cwd = options.cwd ?? process.cwd()
  const git = new CliGitClient(cwd)

  let repoRoot: string
  try {
    repoRoot = await git.repoRoot()
  } catch {
    throw new NotAGitRepositoryError(cwd)
  }

  const diffService = createDiffService(git, jsdiffParser)

  const routes: ReadonlyArray<Route> = [
    { method: 'GET', path: '/api/repo', handler: createRepoHandler(git) },
    { method: 'GET', path: '/api/diff/files', handler: createDiffFilesHandler(diffService) },
    { method: 'GET', path: '/api/diff/file', handler: createDiffFileHandler(diffService) },
  ]

  const server = createApiServer({
    routes,
    mapError: mapDomainErrorToHttpResponse,
    ...(options.staticDir !== undefined
      ? { fallback: createStaticHandler({ rootDir: options.staticDir }) }
      : {}),
  })
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
    const started = await start({ port: readPortFromEnv() })
    console.log(`git-web api listening on ${started.url}`)
    console.log(`target repository: ${started.repoRoot}`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'failed to start')
    process.exit(1)
  }
}

/**
 * 環境変数 PORT から起動ポートを読む。
 * 未指定または不正な値なら 0 (空きポート自動割当) を返す。
 * dev 時に front の Vite プロキシ先を固定するために使う想定。
 */
function readPortFromEnv(): number {
  const raw = process.env['PORT']
  if (raw === undefined || raw === '') {
    return 0
  }
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 65535) {
    console.warn(`invalid PORT env value: ${raw}, falling back to auto-assign`)
    return 0
  }
  return parsed
}
