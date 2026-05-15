import { describe, expect, it } from 'vitest'
import type { GitClient } from '../domain/ports/git-client.js'
import type {
  GitTreeCommitsClient,
  LastCommitInfo,
} from '../domain/ports/git-tree-commits-client.js'
import { parseRevision } from '../domain/revision.js'
import type { TreeEntry } from '../domain/tree.js'
import { createTreeCommitsService } from './tree-commits-service.js'
import type { TreeService } from './tree-service.js'

function makeTreeService(entries: ReadonlyArray<TreeEntry>): TreeService {
  return {
    getTree() {
      return Promise.resolve(entries)
    },
  }
}

function makeGitClient(headSucceeds: boolean): GitClient {
  return {
    head() {
      if (!headSucceeds) return Promise.reject(new Error('not a repo'))
      return Promise.resolve({ commitHash: 'abcdef0', branch: 'main' })
    },
    repoRoot() {
      return Promise.resolve('/tmp/fake')
    },
  }
}

function makeTreeCommitsClient(
  result: ReadonlyMap<string, LastCommitInfo>,
  expectations?: {
    expectedRev?: string
    expectedDir?: string
    expectedNames?: ReadonlyArray<string>
    expectedMaxCount?: number
  },
): GitTreeCommitsClient {
  return {
    lastCommitsByName(rev, dir, targetNames, maxCount) {
      if (expectations?.expectedRev !== undefined) {
        if (rev.raw !== expectations.expectedRev) {
          return Promise.reject(new Error(`unexpected rev: ${rev.raw}`))
        }
      }
      if (expectations?.expectedDir !== undefined) {
        if (dir !== expectations.expectedDir) {
          return Promise.reject(new Error(`unexpected dir: ${dir}`))
        }
      }
      if (expectations?.expectedNames !== undefined) {
        const expected = new Set(expectations.expectedNames)
        if (targetNames.size !== expected.size || [...targetNames].some((n) => !expected.has(n))) {
          return Promise.reject(new Error(`unexpected names: ${[...targetNames].join(',')}`))
        }
      }
      if (expectations?.expectedMaxCount !== undefined) {
        if (maxCount !== expectations.expectedMaxCount) {
          return Promise.reject(new Error(`unexpected maxCount: ${maxCount.toString()}`))
        }
      }
      return Promise.resolve(result)
    },
  }
}

const sampleEntries: ReadonlyArray<TreeEntry> = [
  { name: 'README.md', path: 'README.md', type: 'blob', status: null, mode: null, size: null },
  { name: 'src', path: 'src', type: 'tree', status: null, mode: null, size: null },
]

describe('createTreeCommitsService', () => {
  it('rev 指定時は引数 rev をそのまま port に渡す', async () => {
    const map = new Map<string, LastCommitInfo>([
      ['README.md', { hash: 'h1', date: 100, subject: 'first' }],
      ['src', { hash: 'h2', date: 200, subject: 'second' }],
    ])
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(map, {
        expectedRev: 'v1.0',
        expectedDir: '',
        expectedNames: ['README.md', 'src'],
        expectedMaxCount: 1000,
      }),
      makeGitClient(true),
    )

    const result = await service.getTreeCommits(parseRevision('v1.0'), '')

    expect(result).toEqual([
      { name: 'README.md', lastCommit: { hash: 'h1', date: 100, subject: 'first' } },
      { name: 'src', lastCommit: { hash: 'h2', date: 200, subject: 'second' } },
    ])
  })

  it('rev=null (worktree) のときは HEAD に解決して port に渡す', async () => {
    const map = new Map<string, LastCommitInfo>([
      ['README.md', { hash: 'h1', date: 100, subject: 'first' }],
    ])
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(map, { expectedRev: 'HEAD' }),
      makeGitClient(true),
    )

    const result = await service.getTreeCommits(null, '')

    expect(result[0]?.lastCommit?.subject).toBe('first')
  })

  it('HEAD が解決できない (空リポ) 場合は全エントリ lastCommit=null', async () => {
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(new Map()),
      makeGitClient(false),
    )

    const result = await service.getTreeCommits(null, '')

    expect(result).toEqual([
      { name: 'README.md', lastCommit: null },
      { name: 'src', lastCommit: null },
    ])
  })

  it('tree が空なら空配列を返す', async () => {
    const service = createTreeCommitsService(
      makeTreeService([]),
      makeTreeCommitsClient(new Map()),
      makeGitClient(true),
    )

    const result = await service.getTreeCommits(parseRevision('HEAD'), 'empty-dir')

    expect(result).toEqual([])
  })

  it('port が name を返さなかったエントリは lastCommit=null になる', async () => {
    const map = new Map<string, LastCommitInfo>([
      ['README.md', { hash: 'h1', date: 100, subject: 'first' }],
    ])
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(map),
      makeGitClient(true),
    )

    const result = await service.getTreeCommits(parseRevision('HEAD'), '')

    expect(result.find((r) => r.name === 'src')?.lastCommit).toBeNull()
  })

  it('非ルートの path は末尾スラッシュを付けて port に渡す', async () => {
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(new Map(), { expectedDir: 'src/' }),
      makeGitClient(true),
    )

    await service.getTreeCommits(parseRevision('HEAD'), 'src')
  })

  it('既に末尾スラッシュ付きの path はそのまま port に渡す', async () => {
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(new Map(), { expectedDir: 'src/' }),
      makeGitClient(true),
    )

    await service.getTreeCommits(parseRevision('HEAD'), 'src/')
  })

  it('ルート (空文字) はそのまま port に渡す', async () => {
    const service = createTreeCommitsService(
      makeTreeService(sampleEntries),
      makeTreeCommitsClient(new Map(), { expectedDir: '' }),
      makeGitClient(true),
    )

    await service.getTreeCommits(parseRevision('HEAD'), '')
  })
})
