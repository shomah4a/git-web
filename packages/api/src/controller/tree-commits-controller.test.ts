import { describe, expect, it } from 'vitest'
import { InvalidDiffPathError, InvalidRevisionError } from '../domain/errors.js'
import type { Revision } from '../domain/revision.js'
import type { WorktreeClientsFactory } from '../lifecycle/worktree-clients-factory.js'
import type { WorktreeContextResolver } from '../lifecycle/worktree-context-resolver.js'
import { unsafeBuildBoundedWorktreePath } from '../lifecycle/worktree-path.js'
import type { TreeCommitResult, TreeCommitsService } from '../service/tree-commits-service.js'
import { createTreeCommitsHandler } from './tree-commits-controller.js'

type Call = { readonly rev: Revision | null; readonly path: string }

function createFakeService(
  results: ReadonlyArray<TreeCommitResult>,
): TreeCommitsService & { readonly calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    getTreeCommits(_clients, _treeService, rev, path) {
      calls.push({ rev, path })
      return Promise.resolve(results)
    },
  }
}

function fakeResolver(): WorktreeContextResolver {
  const path = unsafeBuildBoundedWorktreePath('/tmp/default')
  return {
    resolve: () => Promise.resolve({ name: 'default', path, isDefault: true }),
    getDefault: () => Promise.resolve({ name: 'default', path, isDefault: true }),
  }
}

const fakeFactory: WorktreeClientsFactory = (bounded) => ({
  path: bounded,
  gitClient: {
    head: () => Promise.resolve({ commitHash: '', branch: null }),
    repoRoot: () => Promise.resolve(bounded.absolutePath),
  },
  gitTreeClient: { listTree: () => Promise.resolve([]) },
  worktreeTreeLister: { listWorktreeTree: () => Promise.resolve([]) },
  worktreeLister: { listWorktreeEntries: () => Promise.resolve([]) },
  treeCommitsClient: { lastCommitsByName: () => Promise.resolve(new Map()) },
  worktreeBlobReader: { read: () => Promise.resolve(null) },
  rawBlobReader: { read: () => Promise.resolve(null) },
})

function makeRequest(url: string): { url: string; method: 'GET' } {
  return { url, method: 'GET' }
}

function deps(service: TreeCommitsService): {
  service: TreeCommitsService
  resolver: WorktreeContextResolver
  factory: WorktreeClientsFactory
} {
  return { service, resolver: fakeResolver(), factory: fakeFactory }
}

describe('createTreeCommitsHandler', () => {
  it('rev クエリなしは rev=null で service を呼ぶ', async () => {
    const service = createFakeService([{ name: 'README.md', lastCommit: null }])
    const handler = createTreeCommitsHandler(deps(service))

    const res = await handler(makeRequest('/api/tree-commits'))

    expect(res.status).toBe(200)
    expect(service.calls).toEqual([{ rev: null, path: '' }])
  })

  it('rev/path クエリを正しくパースする', async () => {
    const service = createFakeService([])
    const handler = createTreeCommitsHandler(deps(service))

    await handler(makeRequest('/api/tree-commits?rev=HEAD&path=src'))

    const call = service.calls[0]
    if (call === undefined) throw new Error('expected call')
    expect(call.rev?.raw).toBe('HEAD')
    expect(call.path).toBe('src')
  })

  it('lastCommit がある結果を DTO として返す', async () => {
    const service = createFakeService([
      {
        name: 'README.md',
        lastCommit: { hash: 'abcdef0123', date: 1745193200, subject: 'initial' },
      },
      { name: 'src', lastCommit: null },
    ])
    const handler = createTreeCommitsHandler(deps(service))

    const res = await handler(makeRequest('/api/tree-commits?rev=HEAD'))

    if (typeof res.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(res.body)
    expect(parsed).toEqual({
      entries: [
        {
          name: 'README.md',
          lastCommit: { hash: 'abcdef0123', date: 1745193200, subject: 'initial' },
        },
        { name: 'src', lastCommit: null },
      ],
    })
  })

  it('不正な rev は InvalidRevisionError を投げる', async () => {
    const service = createFakeService([])
    const handler = createTreeCommitsHandler(deps(service))

    await expect(handler(makeRequest('/api/tree-commits?rev=--bad'))).rejects.toBeInstanceOf(
      InvalidRevisionError,
    )
  })

  it('不正な path は InvalidDiffPathError を投げる', async () => {
    const service = createFakeService([])
    const handler = createTreeCommitsHandler(deps(service))

    await expect(handler(makeRequest('/api/tree-commits?path=../escape'))).rejects.toBeInstanceOf(
      InvalidDiffPathError,
    )
  })

  it('path クエリの空文字はルートとして扱う', async () => {
    const service = createFakeService([])
    const handler = createTreeCommitsHandler(deps(service))

    await handler(makeRequest('/api/tree-commits?path='))

    expect(service.calls[0]?.path).toBe('')
  })
})
