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
   * ブランチノードを円周上に配置する座標を返す。
   *
   * merge と fork を円周の上端・下端とし、ブランチノードを右側の円弧上に
   * 等間隔配置する。merge/fork 自体も円周上の点であり、接続が自然に見える。
   *
   * 円の中心は merge と fork の中点から左に半径分ずれた位置。
   * merge (角度 -π/2 = 上) から fork (角度 π/2 = 下) へ右回り。
   *
   * @param index ブランチパス内のインデックス (0-based)
   * @param count ブランチパスのノード総数
   * @param mergeY マージコミットの Y 座標
   * @param forkY フォークポイントの Y 座標
   * @param branchIndex 同一マージの複数ブランチ番号 (0, 1, ...)
   */
  /** ブランチノード間の最低弧長 (px) */
  const MIN_ARC_SPACING = 60

  function branchCirclePosition(
    index: number,
    count: number,
    mergeY: number,
    forkY: number,
    branchIndex: number,
  ): { x: number; y: number } {
    // 半円の弧長がノード数 × 最低間隔を満たすよう半径を決める
    // 半円の弧長 = π * r なので r = (count + 1) * MIN_ARC_SPACING / π
    const halfSpan = (forkY - mergeY) / 2
    const radiusBySpacing = ((count + 1) * MIN_ARC_SPACING) / Math.PI
    const radius = Math.max(halfSpan, radiusBySpacing)
    const centerY = mergeY + halfSpan

    // 角度: merge (-π/2) → fork (π/2) の右半円を等間隔に分割
    const angle = -Math.PI / 2 + (Math.PI * (index + 1)) / (count + 1)
    const x = Math.cos(angle) * radius * (branchIndex + 1)
    const y = centerY + Math.sin(angle) * radius
    return { x, y }
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
      for (const branchRootId of branchRoots) {
        // ブランチルートから辿って、ブランチ内の全ノードを収集する
        const branchPath: string[] = []
        let current = branchRootId
        const visited = new Set<string>()
        let forkPointId: string | null = null

        while (!visited.has(current)) {
          visited.add(current)
          const gn = graphNodeById.get(current)
          if (gn === undefined || gn.isMainStream || gn.kind !== 'commit') {
            if (gn !== undefined && gn.isMainStream) {
              forkPointId = current
            }
            break
          }
          branchPath.push(current)
          // 子→親のエッジを探す
          const outEdge = edges.find((e) => e.source === current)
          if (outEdge !== undefined) {
            current = outEdge.target
          } else {
            break
          }
        }

        // merge と fork の Y 座標を取得
        const mergeY = mainStreamPositions.get(mergeHash)?.y ?? 0
        const forkPos = forkPointId !== null ? mainStreamPositions.get(forkPointId) : undefined
        const forkY = forkPos !== undefined ? forkPos.y : mergeY + Y_SPACING

        // ブランチパス上の全ノードを円周上に配置
        for (let i = 0; i < branchPath.length; i++) {
          const nodeId = branchPath[i]
          if (nodeId === undefined) continue
          const pos = branchCirclePosition(i, branchPath.length, mergeY, forkY, branchGroupIndex)
          branchPositions.set(nodeId, pos)
        }
      }
      branchGroupIndex++
    }

    // expand-branch 疑似ノードの位置を親マージコミット基準で計算
    const expandPositions = new Map<string, { x: number; y: number }>()
    let expandIndex = 0
    for (const node of nodes) {
      if (node.kind !== 'expand-branch' || node.mergeCommitHash === null) continue
      const parentPos = mainStreamPositions.get(node.mergeCommitHash)
      if (parentPos !== undefined) {
        expandPositions.set(node.id, {
          x: ARC_X_OFFSET * 0.5 * (expandIndex + 1),
          y: parentPos.y + Y_SPACING * 0.4,
        })
        expandIndex++
      }
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
        const expandPos = expandPositions.get(node.id)
        if (branchPos !== undefined) {
          baseX = branchPos.x
          baseY = branchPos.y
        } else if (expandPos !== undefined) {
          // expand-branch: 親マージコミットの横下にオフセット配置
          baseX = expandPos.x
          baseY = expandPos.y
        } else {
          // その他の非メインストリームノード
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
