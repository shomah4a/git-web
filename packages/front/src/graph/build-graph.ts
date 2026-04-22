/**
 * CommitDto[] から DAG (ノード・エッジ) 構造を構築する純関数群 (ADR 0047)。
 *
 * - メインストリーム判定: 起点コミットの first-parent (parentHashes[0]) 連鎖
 * - マージ枝: デフォルト折りたたみ、expand-branch ノードで展開
 * - ページネーション: hasMore 時に read-more 疑似ノードを末端に配置
 */

import type { CommitDto } from '@git-web/common'

// ---------- 型定義 ----------

export type GraphNodeKind = 'commit' | 'read-more' | 'expand-branch'

export type GraphNode = {
  readonly id: string
  readonly kind: GraphNodeKind
  readonly commit: CommitDto | null
  readonly isMainStream: boolean
  /** expand-branch ノード用: マージコミットの hash */
  readonly mergeCommitHash: string | null
  /** expand-branch ノード用: 展開対象の親ハッシュ */
  readonly branchParentHash: string | null
  /** ノード半径 (変更量の対数スケール) */
  readonly radius: number
}

export type GraphEdge = {
  readonly source: string
  readonly target: string
  /** メインストリーム間のエッジかどうか */
  readonly isMainStream: boolean
}

export type GraphData = {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
}

// ---------- 定数 ----------

const MIN_RADIUS = 16
const MAX_RADIUS = 48
const BASE_RADIUS = 8
const PSEUDO_NODE_RADIUS = 14

// ---------- ノードサイズ計算 ----------

/**
 * 変更行数の対数に比例した半径を返す。
 * clamp(MIN_R, BASE_R * log2(totalLines + 1), MAX_R)
 */
export function commitRadius(commit: CommitDto): number {
  const totalLines = commit.stats.insertions + commit.stats.deletions
  const raw = BASE_RADIUS * Math.log2(totalLines + 1)
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, raw))
}

// ---------- メインストリーム判定 ----------

/**
 * first-parent を辿ってメインストリームに属する hash の Set を返す。
 */
export function findMainStream(commits: ReadonlyArray<CommitDto>): ReadonlySet<string> {
  if (commits.length === 0) return new Set()

  const byHash = new Map<string, CommitDto>()
  for (const c of commits) {
    byHash.set(c.hash, c)
  }

  const mainStream = new Set<string>()
  let current: CommitDto | undefined = commits[0]
  while (current !== undefined) {
    mainStream.add(current.hash)
    const firstParent = current.parentHashes[0]
    current = firstParent !== undefined ? byHash.get(firstParent) : undefined
  }

  return mainStream
}

// ---------- グラフ構築 ----------

/**
 * コミット配列と hasMore フラグからグラフデータを構築する。
 *
 * expandedBranches: 展開済みマージ枝の Set<mergeCommitHash>。
 * デフォルトは空 (全枝折りたたみ)。
 */
export function buildGraph(
  commits: ReadonlyArray<CommitDto>,
  hasMore: boolean,
  expandedBranches: ReadonlySet<string>,
): GraphData {
  if (commits.length === 0) {
    return { nodes: [], edges: [] }
  }

  const byHash = new Map<string, CommitDto>()
  for (const c of commits) {
    byHash.set(c.hash, c)
  }

  const mainStream = findMainStream(commits)

  // グラフに含めるコミットを決定する:
  // 本流 + 展開済みブランチのパス上にあるコミットのみ
  const includedHashes = new Set<string>(mainStream)
  for (const commit of commits) {
    if (!mainStream.has(commit.hash)) continue
    for (let i = 1; i < commit.parentHashes.length; i++) {
      const branchParent = commit.parentHashes[i]
      if (branchParent === undefined) continue
      if (!expandedBranches.has(commit.hash)) continue
      // 展開済み: ブランチパスを first-parent で辿り、含める
      let current = branchParent
      while (byHash.has(current) && !includedHashes.has(current)) {
        includedHashes.add(current)
        const c = byHash.get(current)
        if (c === undefined) break
        const fp = c.parentHashes[0]
        if (fp === undefined) break
        current = fp
      }
    }
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const addedNodeIds = new Set<string>()

  for (const commit of commits) {
    if (!includedHashes.has(commit.hash)) continue
    if (addedNodeIds.has(commit.hash)) continue
    addedNodeIds.add(commit.hash)

    nodes.push({
      id: commit.hash,
      kind: 'commit',
      commit,
      isMainStream: mainStream.has(commit.hash),
      mergeCommitHash: null,
      branchParentHash: null,
      radius: commitRadius(commit),
    })

    // first-parent エッジ (対象がグラフに含まれる場合のみ)
    const firstParent = commit.parentHashes[0]
    if (firstParent !== undefined && includedHashes.has(firstParent)) {
      const bothMainStream = mainStream.has(commit.hash) && mainStream.has(firstParent)
      edges.push({ source: commit.hash, target: firstParent, isMainStream: bothMainStream })
    }

    // マージ枝の処理
    for (let i = 1; i < commit.parentHashes.length; i++) {
      const branchParent = commit.parentHashes[i]
      if (branchParent === undefined) continue

      if (expandedBranches.has(commit.hash)) {
        // 枝展開済み: エッジを追加 (ノードがグラフに含まれていれば)
        if (includedHashes.has(branchParent)) {
          edges.push({ source: commit.hash, target: branchParent, isMainStream: false })
        }
      } else {
        // 枝折りたたみ: expand-branch 疑似ノードを配置
        const pseudoId = `expand:${commit.hash}:${branchParent}`
        if (!addedNodeIds.has(pseudoId)) {
          addedNodeIds.add(pseudoId)
          nodes.push({
            id: pseudoId,
            kind: 'expand-branch',
            commit: null,
            isMainStream: false,
            mergeCommitHash: commit.hash,
            branchParentHash: branchParent,
            radius: PSEUDO_NODE_RADIUS,
          })
          edges.push({ source: commit.hash, target: pseudoId, isMainStream: false })
        }
      }
    }
  }

  // read-more 疑似ノード (本流の最後のコミットから接続する)
  if (hasMore) {
    const lastMainStream = findLastMainStreamCommit(commits, mainStream)
    if (lastMainStream !== undefined) {
      const readMoreId = 'read-more'
      nodes.push({
        id: readMoreId,
        kind: 'read-more',
        commit: null,
        isMainStream: true,
        mergeCommitHash: null,
        branchParentHash: null,
        radius: PSEUDO_NODE_RADIUS,
      })
      edges.push({ source: lastMainStream.hash, target: readMoreId, isMainStream: true })
    }
  }

  return { nodes, edges }
}

/**
 * コミット配列内で本流に属する最後のコミットを返す。
 * first-parent 連鎖の末端 (最も古い本流コミット) に相当する。
 */
function findLastMainStreamCommit(
  commits: ReadonlyArray<CommitDto>,
  mainStream: ReadonlySet<string>,
): CommitDto | undefined {
  let last: CommitDto | undefined
  for (const c of commits) {
    if (mainStream.has(c.hash)) {
      last = c
    }
  }
  return last
}
