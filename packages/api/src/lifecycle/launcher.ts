/**
 * 同一 repoRoot の重複起動抑止つき起動処理 (ADR 0044, ADR 0049)。
 *
 * フロー:
 *   1. repoRoot を解決し realpath で正規化する
 *   2. registry を排他ロック下でロードする
 *   3. 自リポジトリのエントリが live なら `{ kind: 'existing' }` を返して終了する
 *   4. 自リポジトリのエントリが stale なら前回のポートで起動を試みる
 *      - EADDRINUSE なら port=0 でフォールバック起動する
 *   5. エントリがなければ port=0 で起動し、レジストリ内の既存ポートと
 *      重複していたら 1 回だけリトライする
 *   6. 起動成功後、再度ロック取得のうえエントリを upsert する
 *      競合で別プロセスが同一 repoRoot を登録済みだった場合は自サーバを
 *      close して `{ kind: 'existing' }` を返す
 *
 * ADR 0049: エントリの削除は行わない。ポートの永続化のため、
 * レジストリは追記・上書きのみ。
 */

import type { LivenessChecks, Logger, RegistryIO } from './registry.js'
import {
  collectUsedPorts,
  isEntryLive,
  loadRegistry,
  saveRegistry,
  upsertEntry,
  withRegistryLock,
} from './registry.js'

export type LaunchOptions = {
  readonly cwd: string
  readonly host?: string
  readonly port?: number
  readonly staticDir?: string
}

export type ExistingInstance = {
  readonly kind: 'existing'
  readonly url: string
  readonly pid: number
  readonly repoRoot: string
}

export type StartedInstance = {
  readonly kind: 'started'
  readonly url: string
  readonly port: number
  readonly pid: number
  readonly repoRoot: string
  readonly close: () => Promise<void>
}

export type LaunchResult = ExistingInstance | StartedInstance

export type StartFn = (options: {
  cwd: string
  host?: string
  port?: number
  staticDir?: string
}) => Promise<{ url: string; repoRoot: string; close: () => Promise<void> }>

export type RepoRootResolver = (cwd: string) => Promise<string>

export type PathNormalizer = (path: string) => Promise<string>

export type LauncherDeps = {
  readonly start: StartFn
  readonly resolveRepoRoot: RepoRootResolver
  readonly realpath: PathNormalizer
  readonly io: RegistryIO
  readonly liveness: LivenessChecks
  readonly logger: Logger
  readonly now: () => Date
  readonly pid: number
  readonly paths: { filePath: string; lockPath: string }
}

export async function launch(deps: LauncherDeps, options: LaunchOptions): Promise<LaunchResult> {
  const rawRepoRoot = await deps.resolveRepoRoot(options.cwd)
  const repoRoot = await deps.realpath(rawRepoRoot.trim())

  // レジストリをロードし、自リポジトリのエントリを確認する
  const check = await withRegistryLock(deps.io, deps.paths.lockPath, async () => {
    const registry = await loadRegistry(deps.io, deps.paths.filePath, deps.logger)
    const entry = registry.instances[repoRoot]
    if (entry !== undefined) {
      const live = await isEntryLive(entry, deps.liveness)
      if (live) {
        return {
          action: 'existing' as const,
          url: entry.url,
          pid: entry.pid,
        }
      }
      return {
        action: 'start-with-port' as const,
        port: entry.port,
      }
    }
    const usedPorts = collectUsedPorts(registry)
    return {
      action: 'start-new' as const,
      usedPorts,
    }
  })

  if (check.action === 'existing') {
    return {
      kind: 'existing',
      url: check.url,
      pid: check.pid,
      repoRoot,
    }
  }

  let started: Awaited<ReturnType<StartFn>>

  if (options.port !== undefined) {
    // PORT 環境変数等による明示指定は最優先 (ADR 0044, ADR 0049)
    started = await deps.start({
      cwd: options.cwd,
      ...(options.host !== undefined ? { host: options.host } : {}),
      port: options.port,
      ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
    })
  } else if (check.action === 'start-with-port') {
    // stale エントリがある場合: 前回のポートで起動を試みる
    started = await startWithFallback(deps, options, check.port)
  } else {
    // 新規起動: port=0 で OS 割当し、既存ポートとの重複を回避する
    started = await startAvoidingUsedPorts(deps, options, check.usedPorts)
  }

  const port = portFromUrl(started.url)

  // 再度ロックを取得してエントリを登録する
  const registration = await withRegistryLock(deps.io, deps.paths.lockPath, async () => {
    const loaded = await loadRegistry(deps.io, deps.paths.filePath, deps.logger)
    const raceEntry = loaded.instances[repoRoot]
    if (raceEntry !== undefined) {
      const live = await isEntryLive(raceEntry, deps.liveness)
      if (live) {
        return { conflict: raceEntry }
      }
    }
    const entry = {
      port,
      pid: deps.pid,
      url: started.url,
      startedAt: deps.now().toISOString(),
    }
    const next = upsertEntry(loaded, repoRoot, entry)
    await saveRegistry(deps.io, deps.paths.filePath, next)
    return { conflict: null }
  })

  if (registration.conflict !== null) {
    deps.logger.warn(`another git-web instance registered ${repoRoot} first, closing local server`)
    await started.close().catch((err: unknown) => {
      deps.logger.warn(
        `failed to close losing server: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
    return {
      kind: 'existing',
      url: registration.conflict.url,
      pid: registration.conflict.pid,
      repoRoot,
    }
  }

  return {
    kind: 'started',
    url: started.url,
    port,
    pid: deps.pid,
    repoRoot,
    close: () => started.close(),
  }
}

/**
 * 指定ポートで起動を試み、EADDRINUSE なら port=0 でフォールバックする。
 */
async function startWithFallback(
  deps: LauncherDeps,
  options: LaunchOptions,
  preferredPort: number,
): Promise<Awaited<ReturnType<StartFn>>> {
  try {
    return await deps.start({
      cwd: options.cwd,
      ...(options.host !== undefined ? { host: options.host } : {}),
      port: preferredPort,
      ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
    })
  } catch (err) {
    if (isEADDRINUSE(err)) {
      deps.logger.warn(`port ${preferredPort.toString()} is in use, falling back to auto-assign`)
      return deps.start({
        cwd: options.cwd,
        ...(options.host !== undefined ? { host: options.host } : {}),
        ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
      })
    }
    throw err
  }
}

/**
 * port=0 で起動し、割り当てられたポートがレジストリ内の既存ポートと
 * 重複していた場合は 1 回だけ再起動する。
 */
async function startAvoidingUsedPorts(
  deps: LauncherDeps,
  options: LaunchOptions,
  usedPorts: ReadonlySet<number>,
): Promise<Awaited<ReturnType<StartFn>>> {
  const startOpts = {
    cwd: options.cwd,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
  }

  const first = await deps.start(startOpts)
  const firstPort = portFromUrl(first.url)

  if (!usedPorts.has(firstPort)) {
    return first
  }

  // 既存ポートと重複した場合、サーバーを閉じて 1 回だけリトライする
  deps.logger.warn(
    `auto-assigned port ${firstPort.toString()} conflicts with an existing registry entry, retrying`,
  )
  await first.close()
  return deps.start(startOpts)
}

function portFromUrl(url: string): number {
  const parsed = new URL(url)
  const fromField = parsed.port
  if (fromField !== '') {
    return Number.parseInt(fromField, 10)
  }
  return parsed.protocol === 'https:' ? 443 : 80
}

function hasCode(value: unknown, code: string): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  return 'code' in value && value.code === code
}

function isEADDRINUSE(err: unknown): boolean {
  if (hasCode(err, 'EADDRINUSE')) {
    return true
  }
  if (err !== null && typeof err === 'object' && 'cause' in err) {
    return hasCode(err.cause, 'EADDRINUSE')
  }
  return false
}
