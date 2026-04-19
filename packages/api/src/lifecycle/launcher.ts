/**
 * 同一 repoRoot の重複起動抑止つき起動処理 (ADR 0044)。
 *
 * フロー:
 *   1. repoRoot を解決し realpath で正規化する
 *   2. registry を排他ロック下でロード / stale prune する
 *   3. live なエントリがあれば `{ kind: 'existing' }` を返して終了する
 *   4. それ以外はサーバを起動し、再度ロック取得のうえエントリを登録する
 *   5. 競合で別プロセスが同一 repoRoot を登録済みだった場合は自サーバを
 *      close して `{ kind: 'existing' }` を返す
 *
 * 返却オブジェクトには unregister / unregisterSync を含め、
 * 呼び出し側が終了時にレジストリから抜けられるようにする。
 */

import type { LivenessChecks, Logger, Registry, RegistryIO } from './registry.js'
import {
  loadRegistry,
  pruneStale,
  removeEntry,
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
  readonly unregister: () => Promise<void>
  readonly unregisterSync: () => void
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

/**
 * registry を同期書き込みする関数（`process.on('exit')` 用）。
 * ENOENT / JSON 壊れなどが起きても best-effort で吸収する。
 */
export type SyncRegistryWriter = (filePath: string, content: string) => void

/**
 * 同期ロード関数。壊れている／存在しないときは空扱いで返す。
 */
export type SyncRegistryReader = (filePath: string) => Registry

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
  readonly syncRegistry: {
    readonly read: SyncRegistryReader
    readonly write: SyncRegistryWriter
  }
}

export async function launch(deps: LauncherDeps, options: LaunchOptions): Promise<LaunchResult> {
  const rawRepoRoot = await deps.resolveRepoRoot(options.cwd)
  const repoRoot = await deps.realpath(rawRepoRoot.trim())

  const existing = await withRegistryLock(deps.io, deps.paths.lockPath, async () => {
    const loaded = await loadRegistry(deps.io, deps.paths.filePath, deps.logger)
    const { registry: pruned, pruned: removed } = await pruneStale(loaded, deps.liveness)
    if (removed.length > 0 || pruned !== loaded) {
      await saveRegistry(deps.io, deps.paths.filePath, pruned)
    }
    const entry = pruned.instances[repoRoot]
    if (entry !== undefined) {
      return {
        kind: 'existing' as const,
        url: entry.url,
        pid: entry.pid,
        repoRoot,
      }
    }
    return null
  })

  if (existing !== null) {
    return existing
  }

  const started = await deps.start({
    cwd: options.cwd,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
  })

  const port = portFromUrl(started.url)

  const registration = await withRegistryLock(deps.io, deps.paths.lockPath, async () => {
    const loaded = await loadRegistry(deps.io, deps.paths.filePath, deps.logger)
    const { registry: pruned } = await pruneStale(loaded, deps.liveness)
    const raceEntry = pruned.instances[repoRoot]
    if (raceEntry !== undefined) {
      return { conflict: raceEntry }
    }
    const entry = {
      port,
      pid: deps.pid,
      url: started.url,
      startedAt: deps.now().toISOString(),
    }
    const next = upsertEntry(pruned, repoRoot, entry)
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

  let unregistered = false

  const unregister = async (): Promise<void> => {
    if (unregistered) {
      return
    }
    unregistered = true
    try {
      await withRegistryLock(deps.io, deps.paths.lockPath, async () => {
        const loaded = await loadRegistry(deps.io, deps.paths.filePath, deps.logger)
        const entry = loaded.instances[repoRoot]
        if (entry?.pid !== deps.pid) {
          return
        }
        const next = removeEntry(loaded, repoRoot)
        await saveRegistry(deps.io, deps.paths.filePath, next)
      })
    } catch (err) {
      deps.logger.warn(
        `failed to unregister from registry: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const unregisterSync = (): void => {
    if (unregistered) {
      return
    }
    unregistered = true
    try {
      const current = deps.syncRegistry.read(deps.paths.filePath)
      const entry = current.instances[repoRoot]
      if (entry?.pid !== deps.pid) {
        return
      }
      const next = removeEntry(current, repoRoot)
      const serialized = JSON.stringify(next, null, 2) + '\n'
      deps.syncRegistry.write(deps.paths.filePath, serialized)
    } catch {
      // `process.on('exit')` の保険経路では例外を握りつぶす。
      // 次回起動時の stale prune で回収される。
    }
  }

  return {
    kind: 'started',
    url: started.url,
    port,
    pid: deps.pid,
    repoRoot,
    close: () => started.close(),
    unregister,
    unregisterSync,
  }
}

function portFromUrl(url: string): number {
  const parsed = new URL(url)
  const fromField = parsed.port
  if (fromField !== '') {
    return Number.parseInt(fromField, 10)
  }
  return parsed.protocol === 'https:' ? 443 : 80
}
