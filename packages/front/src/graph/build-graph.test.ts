import type { CommitDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import { buildGraph, commitRadius, findMainStream } from './build-graph.js'

// ---------- ���スト用ヘルパー ----------

function makeCommit(overrides: Partial<CommitDto> & { hash: string }): CommitDto {
  return {
    parentHashes: [],
    parentCount: overrides.parentHashes?.length ?? 0,
    authorName: 'Test',
    authorEmail: 'test@example.com',
    date: 1700000000,
    subject: `commit ${overrides.hash}`,
    body: '',
    stats: { filesChanged: 1, insertions: 10, deletions: 5 },
    ...overrides,
  }
}

// ---------- commitRadius ----------

describe('commitRadius', () => {
  it('変更量ゼロのコミットは最小半径を返す', () => {
    const commit = makeCommit({
      hash: 'a',
      stats: { filesChanged: 0, insertions: 0, deletions: 0 },
    })
    expect(commitRadius(commit)).toBe(16)
  })

  it('変更量が大きいコミットは最大半径を超えない', () => {
    const commit = makeCommit({
      hash: 'a',
      stats: { filesChanged: 100, insertions: 100000, deletions: 100000 },
    })
    expect(commitRadius(commit)).toBe(48)
  })

  it('中程度の変更量は最小と最大の間の値を返す', () => {
    const commit = makeCommit({
      hash: 'a',
      stats: { filesChanged: 3, insertions: 15, deletions: 5 },
    })
    const r = commitRadius(commit)
    expect(r).toBeGreaterThan(16)
    expect(r).toBeLessThan(48)
  })
})

// ---------- findMainStream ----------

describe('findMainStream', () => {
  it('空配列は空の Set を返す', () => {
    expect(findMainStream([])).toEqual(new Set())
  })

  it('線形履歴では全コミットがメインストリームに属する', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b'] }),
      makeCommit({ hash: 'b', parentHashes: ['c'] }),
      makeCommit({ hash: 'c', parentHashes: [] }),
    ]
    expect(findMainStream(commits)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('マージ履歴では first-parent 連鎖のみメインストリームに属する', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: ['c'] }),
      makeCommit({ hash: 'c', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: ['c'] }),
    ]
    const mainStream = findMainStream(commits)
    expect(mainStream.has('a')).toBe(true)
    expect(mainStream.has('b')).toBe(true)
    expect(mainStream.has('c')).toBe(true)
    expect(mainStream.has('x')).toBe(false)
  })
})

// ---------- buildGraph ----------

describe('buildGraph', () => {
  it('空配列はノードもエッジもない', () => {
    const result = buildGraph([], false, new Set())
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('線形履歴のノードとエッジを構築する', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b'] }),
      makeCommit({ hash: 'b', parentHashes: ['c'] }),
      makeCommit({ hash: 'c', parentHashes: [] }),
    ]
    const result = buildGraph(commits, false, new Set())

    expect(result.nodes).toHaveLength(3)
    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(result.nodes.every((n) => n.kind === 'commit')).toBe(true)
    expect(result.nodes.every((n) => n.isMainStream)).toBe(true)

    expect(result.edges).toEqual([
      { source: 'a', target: 'b', isMainStream: true },
      { source: 'b', target: 'c', isMainStream: true },
    ])
  })

  it('hasMore が true のとき read-more ノードを末端に配置する', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
    ]
    const result = buildGraph(commits, true, new Set())

    const readMoreNode = result.nodes.find((n) => n.kind === 'read-more')
    expect(readMoreNode).toBeDefined()
    expect(readMoreNode?.id).toBe('read-more')

    const readMoreEdge = result.edges.find((e) => e.target === 'read-more')
    expect(readMoreEdge).toBeDefined()
    expect(readMoreEdge?.source).toBe('b')
  })

  it('マージコミットの第2親は折りたたまれて expand-branch ノードになる', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: [] }),
    ]
    const result = buildGraph(commits, false, new Set())

    const expandNode = result.nodes.find((n) => n.kind === 'expand-branch')
    expect(expandNode).toBeDefined()
    expect(expandNode?.mergeCommitHash).toBe('a')
    expect(expandNode?.branchParentHash).toBe('x')

    // first-parent エッジ + expand-branch エッジ
    expect(result.edges).toContainEqual({ source: 'a', target: 'b', isMainStream: true })
    expect(result.edges).toContainEqual({
      source: 'a',
      target: 'expand:a:x',
      isMainStream: false,
    })
    // x へのエッジは折りたたまれているので存在しない
    expect(result.edges.find((e) => e.source === 'a' && e.target === 'x')).toBeUndefined()
  })

  it('展開済みのマージ枝は expand-branch ではなく直接エッジになる', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: [] }),
    ]
    const result = buildGraph(commits, false, new Set(['a']))

    const expandNode = result.nodes.find((n) => n.kind === 'expand-branch')
    expect(expandNode).toBeUndefined()

    expect(result.edges).toContainEqual({ source: 'a', target: 'b', isMainStream: true })
    expect(result.edges).toContainEqual({ source: 'a', target: 'x', isMainStream: false })
  })

  it('ルートコミットはエッジを持たない', () => {
    const commits = [makeCommit({ hash: 'root', parentHashes: [] })]
    const result = buildGraph(commits, false, new Set())

    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toEqual([])
  })

  it('折りたたみ状態のブランチコミットはグラフに含まれない', () => {
    // main: a(merge) -> b
    // branch: a -> x -> y -> b (collapsed)
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: ['y'] }),
      makeCommit({ hash: 'y', parentHashes: ['b'] }),
    ]
    const result = buildGraph(commits, false, new Set())

    // x, y はグラフに含まれない
    const nodeIds = result.nodes.map((n) => n.id)
    expect(nodeIds).toContain('a')
    expect(nodeIds).toContain('b')
    expect(nodeIds).not.toContain('x')
    expect(nodeIds).not.toContain('y')

    // expand-branch 疑似ノードは存在する
    expect(result.nodes.find((n) => n.kind === 'expand-branch')).toBeDefined()
  })

  it('展開済みブランチのコミットはグラフに含まれる', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: ['y'] }),
      makeCommit({ hash: 'y', parentHashes: ['b'] }),
    ]
    const result = buildGraph(commits, false, new Set(['a']))

    const nodeIds = result.nodes.map((n) => n.id)
    expect(nodeIds).toContain('a')
    expect(nodeIds).toContain('b')
    expect(nodeIds).toContain('x')
    expect(nodeIds).toContain('y')
  })

  it('read-more は本流の最後のコミットから接続される', () => {
    // main: a(merge) -> b, branch: a -> x (collapsed)
    // commits 配列の末尾が x でも read-more は b から接続
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b', 'x'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
      makeCommit({ hash: 'x', parentHashes: [] }),
    ]
    const result = buildGraph(commits, true, new Set())

    const readMoreEdge = result.edges.find((e) => e.target === 'read-more')
    expect(readMoreEdge).toBeDefined()
    expect(readMoreEdge?.source).toBe('b')
    expect(readMoreEdge?.isMainStream).toBe(true)
  })

  it('read-more は本流上に配置される', () => {
    const commits = [
      makeCommit({ hash: 'a', parentHashes: ['b'] }),
      makeCommit({ hash: 'b', parentHashes: [] }),
    ]
    const result = buildGraph(commits, true, new Set())

    const readMoreNode = result.nodes.find((n) => n.kind === 'read-more')
    expect(readMoreNode?.isMainStream).toBe(true)
  })
})
