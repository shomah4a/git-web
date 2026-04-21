/**
 * d3-force シミュレーション composable (ADR 0047)。
 *
 * GraphNode[] と GraphEdge[] を受け取り、力学シ���ュレーションで
 * ノード座標を計算する。tick ごとに ref を更新し、SVG 描画を駆動する。
 */

import type { Ref } from 'vue'
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { ref, onBeforeUnmount } from 'vue'
import type { GraphEdge, GraphNode } from './build-graph.js'

// ---------- シミュレーション用の mutable 型 ----------

export type SimNode = SimulationNodeDatum & {
  readonly id: string
  readonly radius: number
  readonly isMainStream: boolean
  readonly rank: number
}

type SimEdge = SimulationLinkDatum<SimNode>

// ---------- 定数 ----------

const Y_SPACING = 120
const BRANCH_X_STRENGTH = 0.15
const LINK_DISTANCE = 100
const MANY_BODY_STRENGTH = -200
const ALPHA_DECAY = 0.05

// ---------- composable ----------

export type GraphSimulation = {
  /** 現在のシミュレーションノード座標 (tick ごとに更新) */
  readonly simNodes: Ref<ReadonlyArray<SimNode>>
  /** シミュレーションを新しいグラフデータで再構築する */
  readonly update: (nodes: ReadonlyArray<GraphNode>, edges: ReadonlyArray<GraphEdge>) => void
  /** 指定ノードの座標を固定する (ドラッグ用) */
  readonly fixNode: (id: string, x: number, y: number) => void
  /** 指定ノードの座標固定を解除する */
  readonly unfixNode: (id: string) => void
  /** シミュレーションを再加熱する */
  readonly reheat: () => void
}

export function useGraphSimulation(): GraphSimulation {
  const simNodes = ref<ReadonlyArray<SimNode>>([])
  let simulation: Simulation<SimNode, SimEdge> | null = null
  let nodeMap = new Map<string, SimNode>()

  function assignRanks(
    nodes: ReadonlyArray<GraphNode>,
    edges: ReadonlyArray<GraphEdge>,
  ): Map<string, number> {
    // トポロジカル順序でランクを割り当てる
    // ソースが子 (新しい)、ターゲットが親 (古い) なので、
    // ソースのランクを小さく (上)、ターゲットのランクを大きく (下) する
    const ranks = new Map<string, number>()
    const childToParents = new Map<string, string[]>()
    const nodeIds = new Set(nodes.map((n) => n.id))

    for (const edge of edges) {
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target
      if (!childToParents.has(edge.source)) {
        childToParents.set(edge.source, [])
      }
      childToParents.get(edge.source)?.push(targetId)
    }

    // BFS でランク割り当て
    // ルート (入次数0) を探す
    const hasIncoming = new Set<string>()
    for (const edge of edges) {
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target
      hasIncoming.add(targetId)
    }

    const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
    if (roots.length === 0 && nodes.length > 0) {
      const first = nodes[0]
      if (first !== undefined) {
        roots.push(first.id)
      }
    }

    const queue: Array<{ id: string; rank: number }> = roots.map((id) => ({ id, rank: 0 }))
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      if (ranks.has(item.id)) continue
      ranks.set(item.id, item.rank)

      const parents = childToParents.get(item.id) ?? []
      for (const parentId of parents) {
        if (!ranks.has(parentId) && nodeIds.has(parentId)) {
          queue.push({ id: parentId, rank: item.rank + 1 })
        }
      }
    }

    // ランクが割り当てられなかったノード (孤立ノード)
    for (const node of nodes) {
      if (!ranks.has(node.id)) {
        ranks.set(node.id, ranks.size)
      }
    }

    return ranks
  }

  function update(nodes: ReadonlyArray<GraphNode>, edges: ReadonlyArray<GraphEdge>): void {
    if (simulation !== null) {
      simulation.stop()
    }

    const ranks = assignRanks(nodes, edges)
    const prevNodeMap = nodeMap
    nodeMap = new Map()

    const simNodeArray: SimNode[] = nodes.map((node) => {
      const rank = ranks.get(node.id) ?? 0
      const prev = prevNodeMap.get(node.id)
      const sn: SimNode = {
        id: node.id,
        radius: node.radius,
        isMainStream: node.isMainStream,
        rank,
        x: prev?.x ?? (node.isMainStream ? 0 : 120 + Math.random() * 60),
        y: prev?.y ?? rank * Y_SPACING,
        // メインストリームノードは X=0 に固定して整列させる
        fx: node.isMainStream ? 0 : undefined,
      }
      nodeMap.set(node.id, sn)
      return sn
    })

    const simEdges: SimEdge[] = []
    for (const e of edges) {
      const src = nodeMap.get(e.source)
      const tgt = nodeMap.get(e.target)
      if (src !== undefined && tgt !== undefined) {
        simEdges.push({ source: src, target: tgt })
      }
    }

    simulation = forceSimulation<SimNode>(simNodeArray)
      .alphaDecay(ALPHA_DECAY)
      .force('y', forceY<SimNode>((d) => d.rank * Y_SPACING).strength(0.8))
      .force(
        'x',
        forceX<SimNode>(0).strength((d) => (d.isMainStream ? 0 : BRANCH_X_STRENGTH)),
      )
      .force(
        'link',
        forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(0.5),
      )
      .force(
        'collide',
        forceCollide<SimNode>((d) => d.radius + 20),
      )
      .force('charge', forceManyBody<SimNode>().strength(MANY_BODY_STRENGTH))
      .on('tick', () => {
        // simNodeArray の座標は d3 が in-place で更新するので、
        // ref に新しい配列参照を代入して Vue のリアクティビティを発火する
        simNodes.value = [...simNodeArray]
        // nodeMap も更新 (fixNode/unfixNode で参照するため)
        for (const sn of simNodeArray) {
          nodeMap.set(sn.id, sn)
        }
      })
  }

  function fixNode(id: string, x: number, y: number): void {
    const node = nodeMap.get(id)
    if (node !== undefined) {
      node.fx = x
      node.fy = y
      simulation?.alpha(0.3).restart()
    }
  }

  function unfixNode(id: string): void {
    const node = nodeMap.get(id)
    if (node !== undefined) {
      // メインストリームノードは X=0 固定を復元する
      node.fx = node.isMainStream ? 0 : null
      node.fy = null
      simulation?.alpha(0.3).restart()
    }
  }

  function reheat(): void {
    simulation?.alpha(0.5).restart()
  }

  onBeforeUnmount(() => {
    simulation?.stop()
  })

  return { simNodes, update, fixNode, unfixNode, reheat }
}
