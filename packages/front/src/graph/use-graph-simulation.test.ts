import type { CommitDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from './build-graph.js'
import { useGraphSimulation } from './use-graph-simulation.js'

// ---------- テスト用ヘルパー ----------

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

function makeNode(id: string, isMainStream: boolean, commit: CommitDto | null = null): GraphNode {
  return {
    id,
    kind: 'commit',
    commit,
    isMainStream,
    mergeCommitHash: null,
    branchParentHash: null,
    radius: 16,
  }
}

const defaultViewport = { width: 1200, height: 800 }

// ---------- テスト ----------

describe('useGraphSimulation', () => {
  describe('ブランチ弧配置', () => {
    it('ブランチノードは本流と異なるX座標に配置される', () => {
      // main: M -> B (mainstream)
      // branch: M -> x -> B (x は非mainstream)
      const nodes: GraphNode[] = [
        makeNode('M', true, makeCommit({ hash: 'M', parentHashes: ['B', 'x'] })),
        makeNode('B', true, makeCommit({ hash: 'B', parentHashes: [] })),
        makeNode('x', false, makeCommit({ hash: 'x', parentHashes: ['B'] })),
      ]
      const edges: GraphEdge[] = [
        { source: 'M', target: 'B', isMainStream: true },
        { source: 'M', target: 'x', isMainStream: false },
        { source: 'x', target: 'B', isMainStream: false },
      ]

      const sim = useGraphSimulation()
      sim.update(nodes, edges, defaultViewport)

      const xNode = sim.simNodes.value.find((n) => n.id === 'x')
      expect(xNode).toBeDefined()
      expect(xNode?.baseX).not.toBe(0)
    })

    it('本流より多くのコミットを持つブランチのノードがX=0に配置されない', () => {
      // main: merge -> m1 -> m2 -> base (4ノード)
      // branch: merge -> b1 -> b2 -> b3 -> b4 -> b5 -> base (5ブランチノード)
      // BFS では base は merge -> m1 -> m2 -> base (rank 3) で到達される
      // ブランチノードは rank 1~5 に分布する
      const nodes: GraphNode[] = [
        makeNode('merge', true, makeCommit({ hash: 'merge', parentHashes: ['m1', 'b1'] })),
        makeNode('m1', true, makeCommit({ hash: 'm1', parentHashes: ['m2'] })),
        makeNode('m2', true, makeCommit({ hash: 'm2', parentHashes: ['base'] })),
        makeNode('base', true, makeCommit({ hash: 'base', parentHashes: [] })),
        makeNode('b1', false, makeCommit({ hash: 'b1', parentHashes: ['b2'] })),
        makeNode('b2', false, makeCommit({ hash: 'b2', parentHashes: ['b3'] })),
        makeNode('b3', false, makeCommit({ hash: 'b3', parentHashes: ['b4'] })),
        makeNode('b4', false, makeCommit({ hash: 'b4', parentHashes: ['b5'] })),
        makeNode('b5', false, makeCommit({ hash: 'b5', parentHashes: ['base'] })),
      ]
      const edges: GraphEdge[] = [
        { source: 'merge', target: 'm1', isMainStream: true },
        { source: 'm1', target: 'm2', isMainStream: true },
        { source: 'm2', target: 'base', isMainStream: true },
        { source: 'merge', target: 'b1', isMainStream: false },
        { source: 'b1', target: 'b2', isMainStream: false },
        { source: 'b2', target: 'b3', isMainStream: false },
        { source: 'b3', target: 'b4', isMainStream: false },
        { source: 'b4', target: 'b5', isMainStream: false },
        { source: 'b5', target: 'base', isMainStream: false },
      ]

      const sim = useGraphSimulation()
      sim.update(nodes, edges, defaultViewport)

      const branchIds = ['b1', 'b2', 'b3', 'b4', 'b5']
      for (const id of branchIds) {
        const node = sim.simNodes.value.find((n) => n.id === id)
        expect(node).toBeDefined()
        expect(node?.baseX, `ブランチノード ${id} が X=0 に配置されている`).not.toBe(0)
      }
    })

    it('read-more後に追加された本流ノードとブランチノードが重ならない', () => {
      // read-more で本流が伸びたシナリオ:
      // main: merge -> m1 -> m2 -> m3 -> m4 -> m5 (6ノード)
      // branch: merge -> b1 -> b2 -> b3 -> m1 (3ブランチノード)
      // BFS では m1 は merge -> m1 (rank 1) で到達されるが、
      // ブランチ経由では merge -> b1 -> b2 -> b3 -> m1 (rank 4)
      const nodes: GraphNode[] = [
        makeNode('merge', true, makeCommit({ hash: 'merge', parentHashes: ['m1', 'b1'] })),
        makeNode('m1', true, makeCommit({ hash: 'm1', parentHashes: ['m2'] })),
        makeNode('m2', true, makeCommit({ hash: 'm2', parentHashes: ['m3'] })),
        makeNode('m3', true, makeCommit({ hash: 'm3', parentHashes: ['m4'] })),
        makeNode('m4', true, makeCommit({ hash: 'm4', parentHashes: ['m5'] })),
        makeNode('m5', true, makeCommit({ hash: 'm5', parentHashes: [] })),
        makeNode('b1', false, makeCommit({ hash: 'b1', parentHashes: ['b2'] })),
        makeNode('b2', false, makeCommit({ hash: 'b2', parentHashes: ['b3'] })),
        makeNode('b3', false, makeCommit({ hash: 'b3', parentHashes: ['m1'] })),
      ]
      const edges: GraphEdge[] = [
        { source: 'merge', target: 'm1', isMainStream: true },
        { source: 'm1', target: 'm2', isMainStream: true },
        { source: 'm2', target: 'm3', isMainStream: true },
        { source: 'm3', target: 'm4', isMainStream: true },
        { source: 'm4', target: 'm5', isMainStream: true },
        { source: 'merge', target: 'b1', isMainStream: false },
        { source: 'b1', target: 'b2', isMainStream: false },
        { source: 'b2', target: 'b3', isMainStream: false },
        { source: 'b3', target: 'm1', isMainStream: false },
      ]

      const sim = useGraphSimulation()
      sim.update(nodes, edges, defaultViewport)

      // ブランチノードの X 座標が本流 (X=0) と異なることを検証
      const branchIds = ['b1', 'b2', 'b3']
      for (const id of branchIds) {
        const node = sim.simNodes.value.find((n) => n.id === id)
        expect(node).toBeDefined()
        expect(node?.baseX, `ブランチノード ${id} が X=0 に配置されている`).not.toBe(0)
      }

      // 本流ノードは X=0 であること
      const mainIds = ['merge', 'm1', 'm2', 'm3', 'm4', 'm5']
      for (const id of mainIds) {
        const node = sim.simNodes.value.find((n) => n.id === id)
        expect(node).toBeDefined()
        expect(node?.baseX, `本流ノード ${id} が X=0 でない`).toBe(0)
      }
    })
  })

  describe('expand-branch 疑似ノード配置', () => {
    it('expand ノードは親マージコミットと read-more の間に配置され重ならない', () => {
      // main: merge -> base, branch collapsed
      const nodes: GraphNode[] = [
        makeNode('merge', true, makeCommit({ hash: 'merge', parentHashes: ['base', 'b1'] })),
        makeNode('base', true, makeCommit({ hash: 'base', parentHashes: [] })),
        {
          id: 'expand:merge:b1',
          kind: 'expand-branch',
          commit: null,
          isMainStream: false,
          mergeCommitHash: 'merge',
          branchParentHash: 'b1',
          radius: 14,
        },
        {
          id: 'read-more',
          kind: 'read-more',
          commit: null,
          isMainStream: true,
          mergeCommitHash: null,
          branchParentHash: null,
          radius: 14,
        },
      ]
      const edges: GraphEdge[] = [
        { source: 'merge', target: 'base', isMainStream: true },
        { source: 'merge', target: 'expand:merge:b1', isMainStream: false },
        { source: 'base', target: 'read-more', isMainStream: true },
      ]

      const sim = useGraphSimulation()
      sim.update(nodes, edges, defaultViewport)

      const expandNode = sim.simNodes.value.find((n) => n.id === 'expand:merge:b1')
      const readMoreNode = sim.simNodes.value.find((n) => n.id === 'read-more')
      const mergeNode = sim.simNodes.value.find((n) => n.id === 'merge')
      const baseNode = sim.simNodes.value.find((n) => n.id === 'base')

      // expand はマージコミットの右横（X > 0）に配置
      expect(expandNode?.baseX).toBeGreaterThan(0)

      // expand と read-more の Y 座標が異なる
      expect(expandNode?.baseY).not.toBe(readMoreNode?.baseY)

      // expand の Y はマージと base の間にある
      const mergeY = mergeNode?.baseY ?? 0
      const baseY = baseNode?.baseY ?? 0
      expect(expandNode?.baseY).toBeGreaterThan(mergeY)
      expect(expandNode?.baseY).toBeLessThan(baseY)
    })
  })
})
