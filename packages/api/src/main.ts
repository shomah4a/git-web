/**
 * api パッケージのエントリ。
 *
 * start(options) を export し、bin/git-web から import して呼べるようにする。
 * 直接 node で起動された場合も自動で start() を呼ぶ。
 */

import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createCompositeBlobReader } from './adapter/blob-reader-composite.js'
import { createWorktreeBlobReader } from './adapter/fs/worktree-blob-reader.js'
import type { ExecFileFn } from './adapter/git/cat-file-blob-reader.js'
import { createCatFileBlobReader } from './adapter/git/cat-file-blob-reader.js'
import { CliGitClient } from './adapter/git/cli-client.js'
import { WorktreeLister } from './adapter/git/worktree-lister.js'
import { WorktreeListClient } from './adapter/git/worktree-list-client.js'
import { jsdiffParser } from './adapter/jsdiff/parser.js'
import { createBlobHandler } from './controller/blob-controller.js'
import { createBlobRawHandler } from './controller/blob-raw-controller.js'
import { createCommitsHandler } from './controller/commits-controller.js'
import { createDiffFileHandler, createDiffFilesHandler } from './controller/diff-controller.js'
import { mapDomainErrorToHttpResponse } from './controller/error-mapper.js'
import { createRefsHandler } from './controller/refs-controller.js'
import { createRepoHandler } from './controller/repo-controller.js'
import { createTreeCommitsHandler } from './controller/tree-commits-controller.js'
import { createTreeHandler } from './controller/tree-controller.js'
import { createWorktreeHandler } from './controller/worktree-controller.js'
import { createWorktreesListHandler } from './controller/worktrees-list-controller.js'
import { NotAGitRepositoryError } from './domain/errors.js'
import type { Revision } from './domain/revision.js'
import { createRawBlobReader } from './adapter/raw-blob-reader-composite.js'
import type { Route } from './http/router.js'
import { close, createApiServer, listen } from './http/server.js'
import { createStaticHandler } from './http/static.js'
import type { LaunchOptions, LaunchResult } from './lifecycle/launcher.js'
import { launch as launchCore } from './lifecycle/launcher.js'
import {
  createNodeLivenessChecks,
  createNodeRegistryIO,
  resolveRegistryPaths,
} from './lifecycle/registry-io-node.js'
import { createBlobService } from './service/blob-service.js'
import { createCommitsService } from './service/commits-service.js'
import { createDiffService } from './service/diff-service.js'
import { createRefsService } from './service/refs-service.js'
import { createTreeCommitsService } from './service/tree-commits-service.js'
import { createTreeService } from './service/tree-service.js'
import { createWorktreeService } from './service/worktree-service.js'
import { createWorktreesListService } from './service/worktrees-list-service.js'

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
 * execFile の非ゼロ終了を表現する Error ラッパ。
 *
 * 元の ExecFileException を mutate せず cause として保持し、adapter の
 * `isBlobNotFoundError` が必要とする `code` / `stderr` を自前のプロパティ
 * として露出する。
 */
class ExecFileFailure extends Error {
  readonly code: number | string | undefined
  readonly stderr: Buffer

  constructor(original: Error, code: number | string | undefined, stderr: Buffer) {
    super(original.message, { cause: original })
    this.name = 'ExecFileFailure'
    this.code = code
    this.stderr = stderr
  }
}

/**
 * node:child_process.execFile をラップして
 * `git cat-file blob` が必要とする Buffer 返却型に揃える。
 *
 * promisify(execFile) の default overload は stdout: string を返すため、
 * encoding: 'buffer' オプションを指定したときの戻り値型を直接取り出せない。
 * ここでは Node の callback 形式を Promise でくるみ直して ExecFileFn
 * シグネチャに合わせる。
 *
 * 非ゼロ終了時は元の ExecFileException を mutate せず、ExecFileFailure に
 * ラップしてから reject する。元例外は `cause` に保持する。
 */
const nodeExecFile: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { ...options }, (err, stdout, stderr) => {
      const stdoutBuf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'utf8')
      const stderrBuf = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr, 'utf8')
      if (err !== null) {
        // err は Node の ExecFileException。code は number (exit code) か
        // string ('ENOENT' 等の systemd error) のいずれかを取る。
        const rawCode = 'code' in err ? err.code : undefined
        const code =
          typeof rawCode === 'number' || typeof rawCode === 'string' ? rawCode : undefined
        reject(new ExecFileFailure(err, code, stderrBuf))
        return
      }
      resolve({ stdout: stdoutBuf, stderr: stderrBuf })
    })
  })

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
  } catch (err) {
    throw new NotAGitRepositoryError(cwd, { cause: err })
  }

  const refsService = createRefsService(git)

  const worktreeReader = createWorktreeBlobReader(repoRoot, {
    realpath: (p) => realpath(p),
    readFile: (p) => readFile(p),
  })
  const catFileReader = createCatFileBlobReader(nodeExecFile, repoRoot)
  const blobReader = createCompositeBlobReader(worktreeReader, catFileReader)
  const diffService = createDiffService(git, jsdiffParser, blobReader)
  const blobService = createBlobService(blobReader)

  const GIT_ENV = { LC_ALL: 'C', LANG: 'C' } as const
  const CAT_FILE_MAX_BUFFER = 50 * 1024 * 1024
  const rawBlobReader = createRawBlobReader(
    repoRoot,
    (p) => realpath(p),
    (p) => readFile(p),
    async (rev: Revision, path: string): Promise<Buffer | null> => {
      const spec = `${rev.raw}:${path}`
      try {
        const result = await nodeExecFile('git', ['-C', repoRoot, 'cat-file', 'blob', spec], {
          env: { ...process.env, ...GIT_ENV },
          maxBuffer: CAT_FILE_MAX_BUFFER,
          encoding: 'buffer',
        })
        return result.stdout
      } catch (err) {
        if (err !== null && typeof err === 'object' && 'code' in err && err.code === 128) {
          return null
        }
        throw err
      }
    },
  )

  const commitsService = createCommitsService(git)
  const treeService = createTreeService(git, git)
  const treeCommitsService = createTreeCommitsService(treeService, git, git)

  const worktreeLister = new WorktreeLister(repoRoot, (p) => stat(p))
  const worktreeService = createWorktreeService(worktreeLister)

  const worktreeListClient = new WorktreeListClient(
    repoRoot,
    (file, args, opts) =>
      new Promise<{ stdout: string }>((resolveExec, reject) => {
        execFile(file, [...args], { cwd: opts.cwd, env: opts.env }, (err, stdout) => {
          if (err !== null) {
            reject(err instanceof Error ? err : new Error('git worktree list failed'))
            return
          }
          const text = typeof stdout === 'string' ? stdout : Buffer.from(stdout).toString('utf8')
          resolveExec({ stdout: text })
        })
      }),
  )
  // 起動時 cwd を realpath 解決し、default worktree の絶対パスとして使う
  const defaultWorktreePath = await realpath(repoRoot)
  const worktreesListService = createWorktreesListService({
    client: worktreeListClient,
    realpath: (p) => realpath(p),
    defaultWorktreePath,
  })

  const routes: ReadonlyArray<Route> = [
    { method: 'GET', path: '/api/repo', handler: createRepoHandler(git) },
    { method: 'GET', path: '/api/diff/files', handler: createDiffFilesHandler(diffService) },
    { method: 'GET', path: '/api/diff/file', handler: createDiffFileHandler(diffService) },
    { method: 'GET', path: '/api/refs', handler: createRefsHandler(refsService) },
    { method: 'GET', path: '/api/blob', handler: createBlobHandler(blobService) },
    { method: 'GET', path: '/api/blob/raw', handler: createBlobRawHandler(rawBlobReader) },
    { method: 'GET', path: '/api/tree', handler: createTreeHandler(treeService) },
    {
      method: 'GET',
      path: '/api/tree-commits',
      handler: createTreeCommitsHandler(treeCommitsService),
    },
    { method: 'GET', path: '/api/commits', handler: createCommitsHandler(commitsService) },
    { method: 'GET', path: '/api/worktree', handler: createWorktreeHandler(worktreeService) },
    {
      method: 'GET',
      path: '/api/worktrees',
      handler: createWorktreesListHandler(worktreesListService),
    },
  ]

  const server = createApiServer({
    routes,
    mapError: mapDomainErrorToHttpResponse,
    ...(options.staticDir !== undefined
      ? { fallback: createStaticHandler({ rootDir: options.staticDir, spaFallback: true }) }
      : {}),
  })
  let addr: Awaited<ReturnType<typeof listen>>
  try {
    addr = await listen(server, options.host ?? '127.0.0.1', options.port ?? 0)
  } catch (err) {
    await close(server)
    throw err
  }
  const url = `http://${addr.host}:${addr.port.toString()}`

  return {
    url,
    repoRoot,
    close: () => close(server),
  }
}

export type { LaunchOptions, LaunchResult } from './lifecycle/launcher.js'

/**
 * bin/git-web から呼ばれる高レベルエントリ (ADR 0044)。
 *
 * - 同一 repoRoot で live な既存インスタンスがあれば `{ kind: 'existing' }` を返す
 * - それ以外は `start()` を呼び、レジストリに登録して `{ kind: 'started', ... }` を返す
 */
export function launch(options: LaunchOptions): Promise<LaunchResult> {
  const paths = resolveRegistryPaths()
  const logger = { warn: (message: string): void => console.warn(message) }
  return launchCore(
    {
      start,
      resolveRepoRoot: async (cwd: string): Promise<string> => {
        const git = new CliGitClient(cwd)
        try {
          return await git.repoRoot()
        } catch (err) {
          throw new NotAGitRepositoryError(cwd, { cause: err })
        }
      },
      realpath: (path: string) => realpath(path),
      io: createNodeRegistryIO(logger),
      liveness: createNodeLivenessChecks(),
      logger,
      now: () => new Date(),
      pid: process.pid,
      paths: { filePath: paths.filePath, lockPath: paths.lockPath },
    },
    options,
  )
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
    const explicitPort = readPortFromEnv(process.env)
    const started = await start(explicitPort !== undefined ? { port: explicitPort } : {})
    console.log(`git-web api listening on ${started.url}`)
    console.log(`target repository: ${started.repoRoot}`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'failed to start')
    process.exit(1)
  }
}

/**
 * 環境変数 PORT から起動ポートを読む。
 *
 * - 未指定・空文字列: undefined を返す（呼び出し側でデフォルト挙動を選ぶ）
 * - 範囲外・数値化不能: 警告を出して undefined を返す
 * - 有効値: そのまま number で返す
 *
 * bin/git-web と main.ts の両方から共通に利用する (ADR 0044)。
 */
export function readPortFromEnv(env: NodeJS.ProcessEnv): number | undefined {
  const raw = env['PORT']
  if (raw === undefined || raw === '') {
    return undefined
  }
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 65535) {
    console.warn(`invalid PORT env value: ${raw}, falling back to auto-assign`)
    return undefined
  }
  return parsed
}
