/**
 * インスタンスレジストリ (ADR 0044)。
 *
 * 同一 repoRoot に対する `git-web` の重複起動を抑止するため、
 * 起動中のインスタンス情報を JSON ファイルに永続化する。
 *
 * 本モジュールは純粋ロジック層として FS や OS 依存処理を引数で受け取る。
 * Node ランタイムへの束縛は `registry-io-node.ts` が担う。
 */

export type InstanceEntry = {
  readonly port: number
  readonly pid: number
  readonly url: string
  readonly startedAt: string
}

export type Registry = {
  readonly version: 1
  readonly instances: Readonly<Record<string, InstanceEntry>>
}

export const EMPTY_REGISTRY: Registry = { version: 1, instances: {} }

/**
 * JSON ファイル読み書きの薄い抽象。
 *
 * - `readFile`: 対象ファイルが存在しないときは null を返す
 * - `writeFileAtomic`: 親ディレクトリ作成、一時ファイル書き出し、rename、
 *   mode 0o600 への chmod までを含む想定
 * - `acquireLock`: 排他ロックの取得。取得できなければ例外を投げる。
 *   戻り値はロック解放関数
 */
export type RegistryIO = {
  readFile(path: string): Promise<string | null>
  writeFileAtomic(path: string, content: string): Promise<void>
  acquireLock(lockPath: string): Promise<() => Promise<void>>
}

export type LivenessChecks = {
  pidAlive(pid: number): boolean
  httpCheck(url: string, timeoutMs: number): Promise<boolean>
  httpTimeoutMs: number
}

export type Logger = {
  warn(message: string): void
}

const REGISTRY_FORMAT_VERSION = 1

/**
 * レジストリをロードする。
 *
 * - ファイルが存在しない → 空レジストリを返す
 * - パースに失敗 / スキーマが不正 → warn ログを出して空レジストリを返す
 *   (ADR 0044 の自己修復方針)
 */
export async function loadRegistry(
  io: Pick<RegistryIO, 'readFile'>,
  filePath: string,
  logger: Logger,
): Promise<Registry> {
  const content = await io.readFile(filePath)
  if (content === null) {
    return EMPTY_REGISTRY
  }
  const parsed = tryParse(content)
  if (parsed === null) {
    logger.warn(`registry file is corrupted, treating as empty: ${filePath}`)
    return EMPTY_REGISTRY
  }
  const validated = validateRegistry(parsed)
  if (validated === null) {
    logger.warn(`registry file has unexpected schema, treating as empty: ${filePath}`)
    return EMPTY_REGISTRY
  }
  return validated
}

/**
 * レジストリをファイルに書き出す。
 */
export async function saveRegistry(
  io: Pick<RegistryIO, 'writeFileAtomic'>,
  filePath: string,
  registry: Registry,
): Promise<void> {
  const serialized = JSON.stringify(registry, null, 2) + '\n'
  await io.writeFileAtomic(filePath, serialized)
}

/**
 * 排他ロック下で任意の処理を実行する。
 *
 * 取得に失敗した場合は acquireLock からの例外がそのまま再送出される。
 * fn の実行中に例外が出ても finally で解放する。
 */
export async function withRegistryLock<T>(
  io: Pick<RegistryIO, 'acquireLock'>,
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await io.acquireLock(lockPath)
  try {
    return await fn()
  } finally {
    await release()
  }
}

/**
 * エントリが live かどうかを判定する。
 *
 * PID が存在しない、または HTTP ヘルスチェックが失敗したら stale 扱い。
 * HTTP チェックは PID reuse による誤判定を避けるための二層目。
 */
export async function isEntryLive(entry: InstanceEntry, checks: LivenessChecks): Promise<boolean> {
  if (!checks.pidAlive(entry.pid)) {
    return false
  }
  try {
    return await checks.httpCheck(entry.url, checks.httpTimeoutMs)
  } catch {
    return false
  }
}

/**
 * repoRoot のエントリを追加 / 上書きして新しい Registry を返す。
 */
export function upsertEntry(registry: Registry, repoRoot: string, entry: InstanceEntry): Registry {
  return {
    version: REGISTRY_FORMAT_VERSION,
    instances: { ...registry.instances, [repoRoot]: entry },
  }
}

/**
 * repoRoot のエントリを除去して新しい Registry を返す。
 */
export function removeEntry(registry: Registry, repoRoot: string): Registry {
  if (!(repoRoot in registry.instances)) {
    return registry
  }
  const next: Record<string, InstanceEntry> = {}
  for (const [key, value] of Object.entries(registry.instances)) {
    if (key !== repoRoot) {
      next[key] = value
    }
  }
  return { version: REGISTRY_FORMAT_VERSION, instances: next }
}

/**
 * stale なエントリを取り除いた新しい Registry を返す。
 * 戻り値に削除されたキー一覧も含める（ログ用途）。
 */
export async function pruneStale(
  registry: Registry,
  checks: LivenessChecks,
): Promise<{ registry: Registry; pruned: ReadonlyArray<string> }> {
  const liveInstances: Record<string, InstanceEntry> = {}
  const pruned: string[] = []
  for (const [key, entry] of Object.entries(registry.instances)) {
    if (await isEntryLive(entry, checks)) {
      liveInstances[key] = entry
    } else {
      pruned.push(key)
    }
  }
  return {
    registry: { version: REGISTRY_FORMAT_VERSION, instances: liveInstances },
    pruned,
  }
}

function tryParse(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateRegistry(parsed: unknown): Registry | null {
  if (!isPlainObject(parsed)) {
    return null
  }
  if (parsed['version'] !== REGISTRY_FORMAT_VERSION) {
    return null
  }
  const rawInstances = parsed['instances']
  if (!isPlainObject(rawInstances)) {
    return null
  }
  const validated: Record<string, InstanceEntry> = {}
  for (const [key, value] of Object.entries(rawInstances)) {
    const entry = validateEntry(value)
    if (entry === null) {
      return null
    }
    validated[key] = entry
  }
  return { version: REGISTRY_FORMAT_VERSION, instances: validated }
}

function validateEntry(value: unknown): InstanceEntry | null {
  if (!isPlainObject(value)) {
    return null
  }
  const port = value['port']
  const pid = value['pid']
  const url = value['url']
  const startedAt = value['startedAt']
  if (typeof port !== 'number' || !Number.isFinite(port)) {
    return null
  }
  if (typeof pid !== 'number' || !Number.isFinite(pid)) {
    return null
  }
  if (typeof url !== 'string') {
    return null
  }
  if (typeof startedAt !== 'string') {
    return null
  }
  return { port, pid, url, startedAt }
}
