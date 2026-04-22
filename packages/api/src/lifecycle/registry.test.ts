import { describe, expect, it } from 'vitest'
import type { InstanceEntry, LivenessChecks, Logger, Registry } from './registry.js'
import {
  collectUsedPorts,
  EMPTY_REGISTRY,
  isEntryLive,
  loadRegistry,
  saveRegistry,
  upsertEntry,
  withRegistryLock,
} from './registry.js'

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

function makeEntry(overrides: Partial<InstanceEntry> = {}): InstanceEntry {
  return {
    port: 12345,
    pid: 100,
    url: 'http://127.0.0.1:12345',
    startedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('loadRegistry', () => {
  it('ファイルが存在しないときは空レジストリを返す', async () => {
    const io = { readFile: (): Promise<string | null> => Promise.resolve(null) }
    const { logger, warnings } = makeLogger()

    const result = await loadRegistry(io, '/tmp/none.json', logger)

    expect(result).toEqual(EMPTY_REGISTRY)
    expect(warnings).toEqual([])
  })

  it('JSON として壊れているファイルは警告ログを出して空扱いで返す', async () => {
    const io = { readFile: (): Promise<string | null> => Promise.resolve('not json {{') }
    const { logger, warnings } = makeLogger()

    const result = await loadRegistry(io, '/tmp/broken.json', logger)

    expect(result).toEqual(EMPTY_REGISTRY)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('corrupted')
  })

  it('スキーマが不正なファイルは警告ログを出して空扱いで返す', async () => {
    const io = {
      readFile: (): Promise<string | null> => Promise.resolve(JSON.stringify({ version: 2 })),
    }
    const { logger, warnings } = makeLogger()

    const result = await loadRegistry(io, '/tmp/v2.json', logger)

    expect(result).toEqual(EMPTY_REGISTRY)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('unexpected schema')
  })

  it('有効な JSON はそのままロードする', async () => {
    const entry = makeEntry()
    const content = JSON.stringify({
      version: 1,
      instances: { '/repo/a': entry },
    })
    const io = { readFile: (): Promise<string | null> => Promise.resolve(content) }
    const { logger } = makeLogger()

    const result = await loadRegistry(io, '/tmp/ok.json', logger)

    expect(result.version).toBe(1)
    expect(result.instances['/repo/a']).toEqual(entry)
  })

  it('エントリのフィールドが欠けている場合は空扱いで返す', async () => {
    const content = JSON.stringify({
      version: 1,
      instances: { '/repo/a': { port: 1, pid: 2, url: 'http://x' } },
    })
    const io = { readFile: (): Promise<string | null> => Promise.resolve(content) }
    const { logger, warnings } = makeLogger()

    const result = await loadRegistry(io, '/tmp/broken-entry.json', logger)

    expect(result).toEqual(EMPTY_REGISTRY)
    expect(warnings).toHaveLength(1)
  })
})

describe('saveRegistry', () => {
  it('writeFileAtomic にシリアライズ済み JSON を渡す', async () => {
    const calls: Array<{ path: string; content: string }> = []
    const io = {
      writeFileAtomic(path: string, content: string): Promise<void> {
        calls.push({ path, content })
        return Promise.resolve()
      },
    }
    const registry: Registry = {
      version: 1,
      instances: { '/repo/a': makeEntry() },
    }

    await saveRegistry(io, '/tmp/out.json', registry)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toBe('/tmp/out.json')
    const parsed: unknown = JSON.parse(calls[0]?.content ?? '')
    expect(parsed).toEqual(registry)
  })
})

describe('withRegistryLock', () => {
  it('fn の前に acquire、後に release が呼ばれる', async () => {
    const order: string[] = []
    const io = {
      acquireLock: (): Promise<() => Promise<void>> => {
        order.push('acquire')
        return Promise.resolve(() => {
          order.push('release')
          return Promise.resolve()
        })
      },
    }

    const result = await withRegistryLock(io, '/tmp/lock', () => {
      order.push('fn')
      return Promise.resolve(42)
    })

    expect(result).toBe(42)
    expect(order).toEqual(['acquire', 'fn', 'release'])
  })

  it('fn が例外を投げても release は呼ばれる', async () => {
    const order: string[] = []
    const io = {
      acquireLock: (): Promise<() => Promise<void>> =>
        Promise.resolve(() => {
          order.push('release')
          return Promise.resolve()
        }),
    }

    await expect(
      withRegistryLock(io, '/tmp/lock', () => {
        order.push('fn')
        return Promise.reject(new Error('boom'))
      }),
    ).rejects.toThrow('boom')
    expect(order).toEqual(['fn', 'release'])
  })
})

describe('upsertEntry', () => {
  it('既存レジストリをそのまま mutate しない', () => {
    const original: Registry = { version: 1, instances: { '/repo/a': makeEntry() } }
    const entry = makeEntry({ port: 99 })

    const next = upsertEntry(original, '/repo/b', entry)

    expect(original.instances['/repo/b']).toBeUndefined()
    expect(next.instances['/repo/b']).toEqual(entry)
    expect(next.instances['/repo/a']).toEqual(original.instances['/repo/a'])
  })

  it('既存キーの値を上書きする', () => {
    const old = makeEntry({ port: 1 })
    const fresh = makeEntry({ port: 2 })
    const original: Registry = { version: 1, instances: { '/repo/a': old } }

    const next = upsertEntry(original, '/repo/a', fresh)

    expect(next.instances['/repo/a']).toEqual(fresh)
  })
})

describe('isEntryLive', () => {
  function makeChecks(
    pidAliveImpl: (pid: number) => boolean,
    httpImpl: (url: string, timeoutMs: number) => Promise<boolean>,
  ): LivenessChecks {
    return {
      pidAlive: pidAliveImpl,
      httpCheck: httpImpl,
      httpTimeoutMs: 500,
    }
  }

  it('pid が alive かつ HTTP が成功すれば live', async () => {
    const checks = makeChecks(
      () => true,
      () => Promise.resolve(true),
    )

    expect(await isEntryLive(makeEntry(), checks)).toBe(true)
  })

  it('pid が alive でなければ HTTP は呼ばない', async () => {
    let httpCalled = false
    const checks = makeChecks(
      () => false,
      () => {
        httpCalled = true
        return Promise.resolve(true)
      },
    )

    expect(await isEntryLive(makeEntry(), checks)).toBe(false)
    expect(httpCalled).toBe(false)
  })

  it('pid が alive でも HTTP が失敗すれば stale', async () => {
    const checks = makeChecks(
      () => true,
      () => Promise.resolve(false),
    )

    expect(await isEntryLive(makeEntry(), checks)).toBe(false)
  })

  it('HTTP チェックが例外を投げても stale として扱う', async () => {
    const checks = makeChecks(
      () => true,
      () => Promise.reject(new Error('network')),
    )

    expect(await isEntryLive(makeEntry(), checks)).toBe(false)
  })
})

describe('collectUsedPorts', () => {
  it('全エントリのポート番号を Set で返す', () => {
    const registry: Registry = {
      version: 1,
      instances: {
        '/repo/a': makeEntry({ port: 10000 }),
        '/repo/b': makeEntry({ port: 20000 }),
        '/repo/c': makeEntry({ port: 30000 }),
      },
    }

    const ports = collectUsedPorts(registry)

    expect(ports).toEqual(new Set([10000, 20000, 30000]))
  })

  it('空レジストリでは空の Set を返す', () => {
    expect(collectUsedPorts(EMPTY_REGISTRY)).toEqual(new Set())
  })
})
