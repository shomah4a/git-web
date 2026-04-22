import { describe, expect, it } from 'vitest'
import type { LauncherDeps, StartFn } from './launcher.js'
import { launch } from './launcher.js'
import type { InstanceEntry, LivenessChecks, Logger, Registry, RegistryIO } from './registry.js'

function makeLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = []
  return {
    logger: {
      warn(message: string): void {
        warnings.push(message)
      },
    },
    warnings,
  }
}

type FakeIOState = {
  readonly io: RegistryIO
  getContent(): string | null
  setContent(content: string): void
  readCount(): number
  writeCount(): number
}

function makeFakeIO(initial: Registry | null = null): FakeIOState {
  let content: string | null = initial === null ? null : serialize(initial)
  let reads = 0
  let writes = 0
  let lockHeld = false
  const io: RegistryIO = {
    readFile(): Promise<string | null> {
      reads++
      return Promise.resolve(content)
    },
    writeFileAtomic(_: string, next: string): Promise<void> {
      writes++
      content = next
      return Promise.resolve()
    },
    acquireLock(): Promise<() => Promise<void>> {
      if (lockHeld) {
        return Promise.reject(new Error('lock already held in test'))
      }
      lockHeld = true
      return Promise.resolve(() => {
        lockHeld = false
        return Promise.resolve()
      })
    },
  }
  return {
    io,
    getContent: () => content,
    setContent: (next: string) => {
      content = next
    },
    readCount: () => reads,
    writeCount: () => writes,
  }
}

function serialize(registry: Registry): string {
  return JSON.stringify(registry, null, 2) + '\n'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseEntry(value: unknown): InstanceEntry {
  if (!isRecord(value)) {
    throw new Error('not an entry object')
  }
  const port = value['port']
  const pid = value['pid']
  const url = value['url']
  const startedAt = value['startedAt']
  if (
    typeof port !== 'number' ||
    typeof pid !== 'number' ||
    typeof url !== 'string' ||
    typeof startedAt !== 'string'
  ) {
    throw new Error('entry fields invalid')
  }
  return { port, pid, url, startedAt }
}

function parseRegistry(content: string): Registry {
  const parsed: unknown = JSON.parse(content)
  if (!isRecord(parsed)) {
    throw new Error('not a registry object')
  }
  if (parsed['version'] !== 1) {
    throw new Error('unknown version')
  }
  const rawInstances = parsed['instances']
  if (!isRecord(rawInstances)) {
    throw new Error('instances missing')
  }
  const instances: Record<string, InstanceEntry> = {}
  for (const [key, value] of Object.entries(rawInstances)) {
    instances[key] = parseEntry(value)
  }
  return { version: 1, instances }
}

function makeEntry(overrides: Partial<InstanceEntry> = {}): InstanceEntry {
  return {
    port: 12345,
    pid: 9999,
    url: 'http://127.0.0.1:12345',
    startedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  }
}

function makeLiveness(
  pidAliveMap: Record<number, boolean>,
  httpOk: (url: string) => boolean,
): LivenessChecks {
  return {
    pidAlive(pid: number): boolean {
      return pidAliveMap[pid] ?? false
    },
    httpCheck(url: string): Promise<boolean> {
      return Promise.resolve(httpOk(url))
    },
    httpTimeoutMs: 500,
  }
}

type StartInvocation = { cwd: string; port?: number; staticDir?: string }

function makeStart(
  url: string,
  repoRoot: string,
  invocations: StartInvocation[],
  closeSpy?: () => void,
): StartFn {
  return (options) => {
    invocations.push({
      cwd: options.cwd,
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
    })
    return Promise.resolve({
      url,
      repoRoot,
      close: () => {
        closeSpy?.()
        return Promise.resolve()
      },
    })
  }
}

/**
 * EADDRINUSE を模擬する StartFn。指定ポートで呼ばれたら reject し、
 * port 未指定（フォールバック）なら成功する。
 */
function makeStartWithEADDRINUSE(
  failPort: number,
  fallbackUrl: string,
  repoRoot: string,
  invocations: StartInvocation[],
): StartFn {
  return (options) => {
    invocations.push({
      cwd: options.cwd,
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
    })
    if (options.port === failPort) {
      const err = new Error(`listen EADDRINUSE: address already in use 127.0.0.1:${failPort}`)
      Object.assign(err, { code: 'EADDRINUSE' })
      return Promise.reject(err)
    }
    return Promise.resolve({
      url: fallbackUrl,
      repoRoot,
      close: () => Promise.resolve(),
    })
  }
}

function makeDeps(overrides: Partial<LauncherDeps>): LauncherDeps {
  const { logger } = makeLogger()
  const base: LauncherDeps = {
    start: () => Promise.reject(new Error('start should not be called')),
    resolveRepoRoot: (cwd: string) => Promise.resolve(`${cwd}/repo`),
    realpath: (path: string) => Promise.resolve(path),
    io: makeFakeIO().io,
    liveness: makeLiveness({}, () => true),
    logger,
    now: () => new Date('2026-04-19T00:00:00.000Z'),
    pid: 100,
    paths: { filePath: '/tmp/registry.json', lockPath: '/tmp/registry.lock' },
  }
  return { ...base, ...overrides }
}

describe('launch', () => {
  it('既存 live エントリがある場合は start を呼ばず existing を返す', async () => {
    const existing = makeEntry({
      port: 40001,
      pid: 111,
      url: 'http://127.0.0.1:40001',
    })
    const state = makeFakeIO({
      version: 1,
      instances: { '/real/repo': existing },
    })
    const invocations: StartInvocation[] = []

    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/raw/repo'),
        realpath: () => Promise.resolve('/real/repo'),
        liveness: makeLiveness({ 111: true }, () => true),
        start: makeStart('should-not-be-used', '/real/repo', invocations),
      }),
      { cwd: '/cwd' },
    )

    expect(result.kind).toBe('existing')
    if (result.kind === 'existing') {
      expect(result.url).toBe('http://127.0.0.1:40001')
      expect(result.pid).toBe(111)
      expect(result.repoRoot).toBe('/real/repo')
    }
    expect(invocations).toHaveLength(0)
  })

  it('stale エントリがある場合は前回のポートで起動する', async () => {
    const stale = makeEntry({ port: 40001, pid: 111, url: 'http://127.0.0.1:40001' })
    const state = makeFakeIO({
      version: 1,
      instances: { '/real/repo': stale },
    })
    const invocations: StartInvocation[] = []
    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 111: false, 100: true }, () => true),
        start: makeStart('http://127.0.0.1:40001', '/real/repo', invocations),
      }),
      { cwd: '/real/repo', staticDir: '/dist' },
    )

    expect(result.kind).toBe('started')
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.port).toBe(40001)
    expect(invocations[0]?.staticDir).toBe('/dist')
    const content = state.getContent()
    expect(content).not.toBeNull()
    if (content !== null) {
      const parsed = parseRegistry(content)
      expect(parsed.instances['/real/repo']?.port).toBe(40001)
      expect(parsed.instances['/real/repo']?.pid).toBe(100)
    }
  })

  it('stale エントリのポートが EADDRINUSE の場合は port=0 でフォールバックする', async () => {
    const stale = makeEntry({ port: 40001, pid: 111, url: 'http://127.0.0.1:40001' })
    const state = makeFakeIO({
      version: 1,
      instances: { '/real/repo': stale },
    })
    const invocations: StartInvocation[] = []
    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 111: false, 100: true }, () => true),
        start: makeStartWithEADDRINUSE(40001, 'http://127.0.0.1:50000', '/real/repo', invocations),
      }),
      { cwd: '/real/repo' },
    )

    expect(result.kind).toBe('started')
    if (result.kind === 'started') {
      expect(result.port).toBe(50000)
    }
    expect(invocations).toHaveLength(2)
    expect(invocations[0]?.port).toBe(40001)
    expect(invocations[1]?.port).toBeUndefined()
  })

  it('PID live でも HTTP check が失敗すれば stale として前回ポートで起動する', async () => {
    const entry = makeEntry({ port: 40001, pid: 111 })
    const state = makeFakeIO({
      version: 1,
      instances: { '/real/repo': entry },
    })
    const invocations: StartInvocation[] = []
    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 111: true, 100: true }, () => false),
        start: makeStart('http://127.0.0.1:40001', '/real/repo', invocations),
      }),
      { cwd: '/real/repo' },
    )

    expect(result.kind).toBe('started')
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.port).toBe(40001)
  })

  it('既存エントリがなければ port=0 で起動して登録する', async () => {
    const state = makeFakeIO(null)
    const invocations: StartInvocation[] = []
    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 100: true }, () => true),
        start: makeStart('http://127.0.0.1:50000', '/real/repo', invocations),
        pid: 100,
      }),
      { cwd: '/real/repo' },
    )

    expect(result.kind).toBe('started')
    if (result.kind === 'started') {
      expect(result.port).toBe(50000)
      expect(result.pid).toBe(100)
    }
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.port).toBeUndefined()
    const parsed = parseRegistry(state.getContent() ?? '')
    expect(parsed.instances['/real/repo']?.url).toBe('http://127.0.0.1:50000')
  })

  it('新規起動で割り当てポートがレジストリ内の既存ポートと重複した場合はリトライする', async () => {
    // 他リポジトリが port=50000 を使用中
    const state = makeFakeIO({
      version: 1,
      instances: {
        '/other/repo': makeEntry({ port: 50000, pid: 200, url: 'http://127.0.0.1:50000' }),
      },
    })
    const invocations: StartInvocation[] = []
    let callCount = 0
    let closed = false
    const start: StartFn = (options) => {
      invocations.push({
        cwd: options.cwd,
        ...(options.port !== undefined ? { port: options.port } : {}),
      })
      callCount++
      if (callCount === 1) {
        // 1回目: OS が重複ポートを割り当てる
        return Promise.resolve({
          url: 'http://127.0.0.1:50000',
          repoRoot: '/real/repo',
          close: () => {
            closed = true
            return Promise.resolve()
          },
        })
      }
      // 2回目: 別のポートが割り当てられる
      return Promise.resolve({
        url: 'http://127.0.0.1:60000',
        repoRoot: '/real/repo',
        close: () => Promise.resolve(),
      })
    }

    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 100: true, 200: true }, () => true),
        start,
        pid: 100,
      }),
      { cwd: '/real/repo' },
    )

    expect(result.kind).toBe('started')
    if (result.kind === 'started') {
      expect(result.port).toBe(60000)
    }
    expect(invocations).toHaveLength(2)
    expect(closed).toBe(true)
  })

  it('起動中に他プロセスが同一 repoRoot を登録した場合は自サーバを close して existing を返す', async () => {
    const state = makeFakeIO(null)
    const invocations: StartInvocation[] = []
    let closed = false

    const deps = makeDeps({
      io: {
        ...state.io,
        readFile: (() => {
          let call = 0
          return (path: string): Promise<string | null> => {
            call++
            if (call === 2) {
              state.setContent(
                serialize({
                  version: 1,
                  instances: {
                    '/real/repo': makeEntry({ port: 55555, pid: 222, url: 'http://x:55555' }),
                  },
                }),
              )
            }
            return state.io.readFile(path)
          }
        })(),
      },
      resolveRepoRoot: () => Promise.resolve('/real/repo'),
      realpath: (p) => Promise.resolve(p),
      liveness: makeLiveness({ 100: true, 222: true }, () => true),
      start: makeStart('http://127.0.0.1:50000', '/real/repo', invocations, () => {
        closed = true
      }),
      pid: 100,
    })

    const result = await launch(deps, { cwd: '/real/repo' })

    expect(result.kind).toBe('existing')
    if (result.kind === 'existing') {
      expect(result.url).toBe('http://x:55555')
      expect(result.pid).toBe(222)
    }
    expect(closed).toBe(true)
  })

  it('options.port が指定されている場合はレジストリのポートより優先する', async () => {
    const stale = makeEntry({ port: 40001, pid: 111, url: 'http://127.0.0.1:40001' })
    const state = makeFakeIO({
      version: 1,
      instances: { '/real/repo': stale },
    })
    const invocations: StartInvocation[] = []
    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('/real/repo'),
        realpath: (p) => Promise.resolve(p),
        liveness: makeLiveness({ 111: false, 100: true }, () => true),
        start: makeStart('http://127.0.0.1:47906', '/real/repo', invocations),
      }),
      { cwd: '/real/repo', port: 47906 },
    )

    expect(result.kind).toBe('started')
    if (result.kind === 'started') {
      expect(result.port).toBe(47906)
    }
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.port).toBe(47906)
  })

  it('repoRoot は resolveRepoRoot の結果を trim + realpath で正規化する', async () => {
    const state = makeFakeIO(null)
    const invocations: StartInvocation[] = []
    const realpathCalls: string[] = []

    const result = await launch(
      makeDeps({
        io: state.io,
        resolveRepoRoot: () => Promise.resolve('  /raw/repo\n'),
        realpath: (p) => {
          realpathCalls.push(p)
          return Promise.resolve(`/real${p}`)
        },
        liveness: makeLiveness({ 100: true }, () => true),
        start: makeStart('http://127.0.0.1:50000', '/whatever', invocations),
        pid: 100,
      }),
      { cwd: '/anything' },
    )

    expect(realpathCalls).toEqual(['/raw/repo'])
    if (result.kind === 'started') {
      expect(result.repoRoot).toBe('/real/raw/repo')
    }
  })
})
