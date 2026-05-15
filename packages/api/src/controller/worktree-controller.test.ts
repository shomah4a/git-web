import { describe, expect, it } from 'vitest'
import { InvalidWorktreeNameError } from '../domain/errors.js'
import type { GitWorktreeClient } from '../domain/ports/git-worktree-client.js'
import type { WorktreeEntry } from '../domain/worktree-entry.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import { unsafeBuildBoundedWorktreePath } from '../lifecycle/worktree-path.js'
import { createWorktreeService } from '../service/worktree-service.js'
import { createWorktreeHandler } from './worktree-controller.js'

type Resolved = {
  readonly clientPath: string
  readonly entries: ReadonlyArray<WorktreeEntry>
}

function fakeResolver(entries: ReadonlyMap<string | null, string | null>): WorktreeContextResolver {
  return {
    resolve: (wtName) => {
      const path = entries.get(wtName) ?? null
      if (path === null) return Promise.resolve(null)
      return Promise.resolve({
        name: wtName ?? 'default',
        path: unsafeBuildBoundedWorktreePath(path),
        isDefault: wtName === null,
      })
    },
    getDefault: () =>
      Promise.resolve({
        name: 'default',
        path: unsafeBuildBoundedWorktreePath(entries.get(null) ?? '/dev/null'),
        isDefault: true,
      }),
  }
}

function fakeFactory(resolvedEntriesByPath: Map<string, ReadonlyArray<WorktreeEntry>>): {
  factory: WorktreeClientsFactory
  calls: Resolved[]
} {
  const calls: Resolved[] = []
  const factory: WorktreeClientsFactory = (bounded) => {
    const path = bounded.absolutePath
    const entries = resolvedEntriesByPath.get(path) ?? []
    const lister: GitWorktreeClient = {
      listWorktreeEntries: () => {
        calls.push({ clientPath: path, entries })
        return Promise.resolve(entries)
      },
    }
    return {
      path: bounded,
      worktreeLister: lister,
      // 以下は本テストでは未使用なので空ダミーで埋める
      treeCommitsClient: { lastCommitsByName: () => Promise.resolve(new Map()) },
      worktreeBlobReader: { read: () => Promise.resolve(null) },
      rawBlobReader: { read: () => Promise.resolve(null) },
    }
  }
  return { factory, calls }
}

function makeRequest(url: string): { url: string; method: 'GET' } {
  return { url, method: 'GET' }
}

describe('createWorktreeHandler', () => {
  it('wt 未指定時は default worktree の lister を呼ぶ', async () => {
    const { factory, calls } = fakeFactory(new Map([['/tmp/default', []]]))
    const handler = createWorktreeHandler({
      service: createWorktreeService(),
      resolver: fakeResolver(new Map([[null, '/tmp/default']])),
      factory,
    })

    const res = await handler(makeRequest('/api/worktree'))
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.clientPath).toBe('/tmp/default')
  })

  it('wt=name 指定で対応する worktree の lister を呼ぶ', async () => {
    const { factory, calls } = fakeFactory(
      new Map([
        ['/tmp/default', []],
        ['/tmp/feat', []],
      ]),
    )
    const handler = createWorktreeHandler({
      service: createWorktreeService(),
      resolver: fakeResolver(
        new Map([
          [null, '/tmp/default'],
          ['feat', '/tmp/feat'],
        ]),
      ),
      factory,
    })

    await handler(makeRequest('/api/worktree?wt=feat'))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.clientPath).toBe('/tmp/feat')
  })

  it('wt が解決できない場合は UnknownWorktreeError を投げる', async () => {
    const { factory } = fakeFactory(new Map([['/tmp/default', []]]))
    const handler = createWorktreeHandler({
      service: createWorktreeService(),
      resolver: fakeResolver(new Map([[null, '/tmp/default']])),
      factory,
    })

    await expect(handler(makeRequest('/api/worktree?wt=missing'))).rejects.toThrow(
      /unknown worktree/,
    )
  })

  it('wt 形式違反は InvalidWorktreeNameError を投げる', async () => {
    const { factory } = fakeFactory(new Map([['/tmp/default', []]]))
    const handler = createWorktreeHandler({
      service: createWorktreeService(),
      resolver: fakeResolver(new Map([[null, '/tmp/default']])),
      factory,
    })

    await expect(handler(makeRequest('/api/worktree?wt=..'))).rejects.toBeInstanceOf(
      InvalidWorktreeNameError,
    )
    await expect(handler(makeRequest('/api/worktree?wt=a/b'))).rejects.toBeInstanceOf(
      InvalidWorktreeNameError,
    )
  })
})
