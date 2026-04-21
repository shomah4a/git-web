/**
 * グラフレイアウト composable (ADR 0047)。
 *
 * 力学シミュレーションではなく幾何的にノード座標を計算する。
 * - メインストリーム: X=0 の縦一列、Y = rank * spacing
 * - ブランチ: マージコミットと合流点を結ぶ弧上に等間隔配置
 * - ドラッグ時は座標を直接上書きし、離すと幾何位置に戻る
 */

import type { Ref } from 'vue'
import { ref } from 'vue'
import type { GraphEdge, GraphNode } from './build-graph.js'

// ---------- レイアウトノード型 ----------

export type SimNode = {
  readonly id: string
  readonly radius: number
  readonly isMainStream: boolean
  readonly rank: number
  /** 幾何計算による本来の位置 */
  readonly baseX: number
  readonly baseY: number
  /** 現在の表示位置 (ドラッグで移動可能) */
  x: number
  y: number
}

// ---------- 定数 ----------

const Y_SPACING = 160
/** ブランチ弧の横方向の膨らみ */
const ARC_X_OFFSET = 250

// ---------- composable ----------

export type ViewportSize = {
  readonly width: number
  readonly height: number
}

export type GraphSimulation = {
  readonly simNodes: Ref<ReadonlyArray<SimNode>>
  readonly update: (
    nodes: ReadonlyArray<GraphNode>,
    edges: ReadonlyArray<GraphEdge>,
    viewportSize: ViewportSize,
  ) => void
  readonly fixNode: (id: string, x: number, y: number) => void
  readonly unfixNode: (id: string) => void
  readonly reheat: () => void
}

export function useGraphSimulation(): GraphSimulation {
  const simNodes = ref<ReadonlyArray<SimNode>>([])
  let nodeMap = new Map<string, SimNode>()

  /**
   * トポロジカル順序でランクを割り当てる。
   * ソース→ターゲット = 子→親 なので、ソースのランクが小さく(上)、
   * ターゲットのランクが大きく(下)なる。
   */
  function assignRanks(
    nodes: ReadonlyArray<GraphNode>,
    edges: ReadonlyArray<GraphEdge>,
  ): Map<string, number> {
    const ranks = new Map<string, number>()
    const childToParents = new Map<string, string[]>()
    const nodeIds = new Set(nodes.map((n) => n.id))

    for (const edge of edges) {
      if (!childToParents.has(edge.source)) {
        childToParents.set(edge.source, [])
      }
      childToParents.get(edge.source)?.push(edge.target)
    }

    const hasIncoming = new Set<string>()
    for (const edge of edges) {
      hasIncoming.add(edge.target)
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

    for (const node of nodes) {
      if (!ranks.has(node.id)) {
        ranks.set(node.id, ranks.size)
      }
    }

    return ranks
  }

  /**
   * ブランチノードのX座標を弧状に計算する。
   *
   * マージコミットの rank を topRank、分岐点 (first-parent の合流先) の rank を
   * bottomRank として、ブランチノードの rank が topRank〜bottomRank の区間で
   * sin カーブの弧を描く。
   *
   * branchIndex: 同じマージコミットに複数ブランチがある場合の番号 (0, 1, ...)
   */
  function arcX(
    nodeRank: number,
    topRank: number,
    bottomRank: number,
    branchIndex: number,
  ): number {
    const span = bottomRank - topRank
    if (span <= 0) return ARC_X_OFFSET * (branchIndex + 1)
    const t = (nodeRank - topRank) / span
    return Math.sin(Math.PI * t) * ARC_X_OFFSET * (branchIndex + 1)
  }

  function update(
    nodes: ReadonlyArray<GraphNode>,
    edges: ReadonlyArray<GraphEdge>,
    viewportSize: ViewportSize,
  ): void {
    void viewportSize
    const ranks = assignRanks(nodes, edges)
    nodeMap = new Map()

    // ノードの hash → GraphNode マップ
    const graphNodeById = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeById.set(n.id, n)
    }

    // メインストリームノードの座標を先に計算
    const mainStreamPositions = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      if (node.isMainStream) {
        const rank = ranks.get(node.id) ?? 0
        mainStreamPositions.set(node.id, { x: 0, y: rank * Y_SPACING })
      }
    }

    // ブランチノードの所属を特定する
    // エッジからマージコミット→ブランチ親の関係を構築
    // ブランチノード = isMainStream でないコミットノード
    // 各ブランチノードの topRank/bottomRank を、
    // そのノードに到達するまでのマージコミットの rank と、
    // そのノードから first-parent を辿ってメインストリームに合流する点の rank で決める

    // 簡易版: ブランチノードは単にメインストリームの横に弧で配置
    // topRank = そのブランチノードに接続するマージコミットのrank
    // bottomRank = そのブランチノードからfirst-parentを辿ってメインストリームに到達する点のrank
    // 到達しない場合は自分のrank+1 (expand-branch等)

    // マージコミットID → 非メインストリームの子エッジを持つノード群
    const branchNodeSets = new Map<string, string[]>()

    // 非メインストリームエッジから、ブランチのグループを構築
    for (const edge of edges) {
      if (!edge.isMainStream) {
        const srcNode = graphNodeById.get(edge.source)
        if (srcNode !== undefined && srcNode.isMainStream && srcNode.kind === 'commit') {
          // マージコミットからブランチへの第一歩
          if (!branchNodeSets.has(edge.source)) {
            branchNodeSets.set(edge.source, [])
          }
          branchNodeSets.get(edge.source)?.push(edge.target)
        }
      }
    }

    // 各ブランチノードの位置を計算
    const branchPositions = new Map<string, { x: number; y: number }>()
    let branchGroupIndex = 0

    for (const [mergeHash, branchRoots] of branchNodeSets) {
      const mergeRank = ranks.get(mergeHash) ?? 0

      for (const branchRootId of branchRoots) {
        // ブランチルートから辿って、ブランチ内の全ノードを収集する
        const branchPath: string[] = []
        let current = branchRootId
        const visited = new Set<string>()
        let bottomRank = ranks.get(branchRootId) ?? mergeRank + 1

        while (!visited.has(current)) {
          visited.add(current)
          const gn = graphNodeById.get(current)
          if (gn === undefined || gn.isMainStream) {
            bottomRank = ranks.get(current) ?? bottomRank
            break
          }
          branchPath.push(current)
          // 子→親のエッジを探す
          const outEdge = edges.find((e) => e.source === current)
          if (outEdge !== undefined) {
            current = outEdge.target
          } else {
            bottomRank = ranks.get(current) ?? bottomRank
            break
          }
        }

        // ブランチパス上の全ノードを弧上に配置
        for (const nodeId of branchPath) {
          const nodeRank = ranks.get(nodeId) ?? mergeRank + 1
          const bx = arcX(nodeRank, mergeRank, bottomRank, branchGroupIndex)
          const by = nodeRank * Y_SPACING
          branchPositions.set(nodeId, { x: bx, y: by })
        }
      }
      branchGroupIndex++
    }

    // 全ノードの SimNode を構築
    // 幾何レイアウトなので常に計算座標を使う (追加読み込み時のリロケーション対応)
    const simNodeArray: SimNode[] = nodes.map((node) => {
      const rank = ranks.get(node.id) ?? 0

      let baseX: number
      let baseY: number

      if (node.isMainStream) {
        baseX = 0
        baseY = rank * Y_SPACING
      } else {
        const branchPos = branchPositions.get(node.id)
        if (branchPos !== undefined) {
          baseX = branchPos.x
          baseY = branchPos.y
        } else {
          // ブランチ位置が特定できないノード (expand-branch 疑似ノード等)
          // 親 (マージコミット) の横に配置
          baseX = ARC_X_OFFSET * 0.5
          baseY = rank * Y_SPACING
        }
      }

      const sn: SimNode = {
        id: node.id,
        radius: node.radius,
        isMainStream: node.isMainStream,
        rank,
        baseX,
        baseY,
        x: baseX,
        y: baseY,
      }
      nodeMap.set(node.id, sn)
      return sn
    })

    simNodes.value = simNodeArray
  }

  function fixNode(id: string, x: number, y: number): void {
    const node = nodeMap.get(id)
    if (node !== undefined) {
      node.x = x
      node.y = y
      simNodes.value = [...simNodes.value]
    }
  }

  function unfixNode(id: string): void {
    const node = nodeMap.get(id)
    if (node !== undefined) {
      // 幾何位置に戻す
      node.x = node.baseX
      node.y = node.baseY
      simNodes.value = [...simNodes.value]
    }
  }

  function reheat(): void {
    // 幾何レイアウトでは再計算不要。update が再呼び出しされるため。
  }

  return { simNodes, update, fixNode, unfixNode, reheat }
}
