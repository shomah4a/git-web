<script setup lang="ts">
/**
 * コミットグラフビューコンポーネント (ADR 0047)。
 *
 * コミット履歴を DAG (有向非巡回グラフ) としてインタラクティブに表示する。
 * - SVG でノード・エッジを描画
 * - d3-force でレイアウト計算
 * - d3-zoom でパン・ズーム
 * - ノードドラッグで再配置
 */

import type { CommitDto, RefListDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchCommits } from '../api/commits.js'
import { fetchRefs } from '../api/refs.js'
import { buildGraph } from '../graph/build-graph.js'
import type { GraphNode } from '../graph/build-graph.js'
import { useGraphSimulation } from '../graph/use-graph-simulation.js'
import type { SimNode } from '../graph/use-graph-simulation.js'
import { useGraphViewport } from '../graph/use-graph-viewport.js'
import RevisionCombobox from './RevisionCombobox.vue'

const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()

function readRevFromRoute(): string {
  const raw = route.query.rev
  return typeof raw === 'string' && raw !== '' ? raw : 'HEAD'
}

const currentRev = ref<string>(readRevFromRoute())
const commits = ref<ReadonlyArray<CommitDto>>([])
const hasMore = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const initialRefs = ref<RefListDto | null>(null)
const expandedBranches = ref<Set<string>>(new Set())
const selectedNodeId = ref<string | null>(null)

let isUnmounted = false
let generation = 0

// ---------- グラフ描画 ----------

const svgRef = ref<SVGSVGElement | null>(null)
const simulation = useGraphSimulation()
const viewport = useGraphViewport()

/** graphNodes を保持して id → GraphNode のマップを構築する */
const graphNodeMap = ref<Map<string, GraphNode>>(new Map())

const graphData = computed(() => buildGraph(commits.value, hasMore.value, expandedBranches.value))

watch(graphData, (data) => {
  const map = new Map<string, GraphNode>()
  for (const node of data.nodes) {
    map.set(node.id, node)
  }
  graphNodeMap.value = map
  simulation.update(data.nodes, data.edges)
})

/** エッジの source/target に対応する SimNode の座標 */
function edgePath(edge: { source: string; target: string }): string {
  const sourceNode = simulation.simNodes.value.find((n) => n.id === edge.source)
  const targetNode = simulation.simNodes.value.find((n) => n.id === edge.target)
  if (sourceNode === undefined || targetNode === undefined) return ''
  const sx = sourceNode.x ?? 0
  const sy = sourceNode.y ?? 0
  const tx = targetNode.x ?? 0
  const ty = targetNode.y ?? 0
  // ベジェ曲線で滑らかに接続
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`
}

// ---------- ノード表示ヘルパー ----------

function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

function formatDate(epochSec: number): string {
  const d = new Date(epochSec * 1000)
  if (Number.isNaN(d.getTime())) return String(epochSec)
  return d.toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statsText(commit: CommitDto): string {
  const parts: string[] = []
  if (commit.stats.insertions > 0) parts.push(`+${commit.stats.insertions.toString()}`)
  if (commit.stats.deletions > 0) parts.push(`-${commit.stats.deletions.toString()}`)
  if (parts.length === 0) return `${commit.stats.filesChanged.toString()}f`
  return `${commit.stats.filesChanged.toString()}f ${parts.join(' ')}`
}

function truncateSubject(subject: string, maxLen: number): string {
  return subject.length > maxLen ? subject.slice(0, maxLen) + '...' : subject
}

// ---------- 選択ノードの詳細 ----------

const selectedCommit = computed<CommitDto | null>(() => {
  if (selectedNodeId.value === null) return null
  const gn = graphNodeMap.value.get(selectedNodeId.value)
  return gn?.commit ?? null
})

function diffUrl(commit: CommitDto): string {
  const params = new URLSearchParams()
  params.set('from', `${commit.hash}^`)
  params.set('to', commit.hash)
  return `/diff?${params.toString()}`
}

function treeUrl(commit: CommitDto): string {
  return `/tree?rev=${encodeURIComponent(commit.hash)}`
}

// ---------- データ取得 ----------

async function loadCommits(rev: string): Promise<void> {
  const gen = ++generation
  loading.value = true
  errorMessage.value = null
  expandedBranches.value = new Set()
  selectedNodeId.value = null
  try {
    const result = await fetchCommits({ rev, after: null, limit: PAGE_SIZE, path: null })
    if (isUnmounted || gen !== generation) return
    commits.value = result.commits
    hasMore.value = result.hasMore
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
    commits.value = []
    hasMore.value = false
  } finally {
    if (!isUnmounted && gen === generation) {
      loading.value = false
    }
  }
}

async function loadMore(): Promise<void> {
  const lastCommit = commits.value[commits.value.length - 1]
  if (lastCommit === undefined || loading.value) return

  const gen = generation
  loading.value = true
  try {
    const result = await fetchCommits({
      rev: currentRev.value,
      after: lastCommit.hash,
      limit: PAGE_SIZE,
      path: null,
    })
    if (isUnmounted || gen !== generation) return
    commits.value = [...commits.value, ...result.commits]
    hasMore.value = result.hasMore
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    if (!isUnmounted && gen === generation) {
      loading.value = false
    }
  }
}

function expandBranch(mergeHash: string): void {
  expandedBranches.value = new Set([...expandedBranches.value, mergeHash])
  simulation.reheat()
}

// ---------- ドラッグ ----------

let dragTarget: SimNode | null = null

function toGraphCoords(event: PointerEvent): { x: number; y: number } | null {
  const svgEl = svgRef.value
  if (svgEl === null) return null
  const ctm = svgEl.getScreenCTM()
  if (ctm === null) return null
  const t = viewport.transform.value
  const svgX = (event.clientX - ctm.e) / ctm.a
  const svgY = (event.clientY - ctm.f) / ctm.d
  return { x: (svgX - t.x) / t.k, y: (svgY - t.y) / t.k }
}

function onDragMove(event: PointerEvent): void {
  if (dragTarget === null) return
  const coords = toGraphCoords(event)
  if (coords !== null) {
    simulation.fixNode(dragTarget.id, coords.x, coords.y)
  }
}

function onDragEnd(): void {
  if (dragTarget !== null) {
    simulation.unfixNode(dragTarget.id)
    dragTarget = null
  }
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
}

function onNodePointerDown(event: PointerEvent, nodeId: string): void {
  const node = simulation.simNodes.value.find((n) => n.id === nodeId)
  if (node === undefined) return
  event.preventDefault()
  dragTarget = node
  simulation.fixNode(nodeId, node.x ?? 0, node.y ?? 0)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
}

// ---------- ノードクリック ----------

function onNodeClick(nodeId: string): void {
  const gn = graphNodeMap.value.get(nodeId)
  if (gn === undefined) return

  if (gn.kind === 'read-more') {
    void loadMore()
    return
  }
  if (gn.kind === 'expand-branch' && gn.mergeCommitHash !== null) {
    expandBranch(gn.mergeCommitHash)
    return
  }
  // commit ノード: 選択トグル
  selectedNodeId.value = selectedNodeId.value === nodeId ? null : nodeId
}

// ---------- URL 同期 ----------

function syncUrl(): void {
  const query: Record<string, string> = {}
  if (currentRev.value !== 'HEAD') {
    query.rev = currentRev.value
  }
  void router.push({ path: '/graph', query })
}

function onRevisionSubmit(): void {
  syncUrl()
  void loadCommits(currentRev.value)
}

function onApply(): void {
  if (loading.value) return
  syncUrl()
  void loadCommits(currentRev.value)
}

watch(
  () => route.query,
  () => {
    const rev = readRevFromRoute()
    if (rev !== currentRev.value) {
      currentRev.value = rev
      void loadCommits(rev)
    }
  },
)

// ---------- ライフサイクル ----------

onMounted(async () => {
  if (svgRef.value !== null) {
    viewport.attach(svgRef.value)
  }

  const [refsResult] = await Promise.all([fetchRefs(''), loadCommits(currentRev.value)])
  if (!isUnmounted) {
    initialRefs.value = refsResult
  }
})

onBeforeUnmount(() => {
  isUnmounted = true
  viewport.detach()
  // ドラッグ中にアンマウントされた場合のクリーンアップ
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
})
</script>

<template>
  <div class="graph-view">
    <Teleport to="#page-header-slot">
      <div class="graph-header">
        <RevisionCombobox
          :model-value="currentRev"
          :initial-refs="initialRefs"
          :allow-worktree="false"
          placeholder="rev"
          @update:model-value="currentRev = $event"
          @submit="onRevisionSubmit"
        />
        <button class="apply-btn" :disabled="loading" @click="onApply">適用</button>
      </div>
    </Teleport>

    <p v-if="loading && commits.length === 0" class="status-message">loading...</p>
    <p v-else-if="errorMessage !== null" class="status-message error">{{ errorMessage }}</p>

    <div v-else class="graph-container">
      <svg ref="svgRef" class="graph-svg">
        <!-- イベント受信用の背景 (透明だがポインタイベントを受け取る) -->
        <rect width="100%" height="100%" fill="transparent" />
        <g
          :transform="`translate(${viewport.transform.value.x}, ${viewport.transform.value.y}) scale(${viewport.transform.value.k})`"
        >
          <!-- エッジ -->
          <path
            v-for="(edge, i) in graphData.edges"
            :key="'e-' + i.toString()"
            :d="edgePath(edge)"
            class="graph-edge"
            fill="none"
          />

          <!-- ノード -->
          <g
            v-for="simNode in simulation.simNodes.value"
            :key="simNode.id"
            :transform="`translate(${(simNode.x ?? 0).toString()}, ${(simNode.y ?? 0).toString()})`"
            class="graph-node"
            :class="{
              'graph-node--selected': selectedNodeId === simNode.id,
              'graph-node--mainstream': simNode.isMainStream,
            }"
            @pointerdown.stop="onNodePointerDown($event, simNode.id)"
            @click.stop="onNodeClick(simNode.id)"
          >
            <!-- commit ノード -->
            <template v-if="graphNodeMap.get(simNode.id)?.kind === 'commit'">
              <circle :r="simNode.radius" class="node-circle" />
              <text class="node-subject" :y="-simNode.radius - 6" text-anchor="middle">
                {{ truncateSubject(graphNodeMap.get(simNode.id)?.commit?.subject ?? '', 24) }}
              </text>
              <text class="node-hash" :y="4" text-anchor="middle">
                {{ shortHash(graphNodeMap.get(simNode.id)?.commit?.hash ?? '') }}
              </text>
              <text class="node-meta" :y="simNode.radius + 14" text-anchor="middle">
                {{ formatDate(graphNodeMap.get(simNode.id)?.commit?.date ?? 0) }}
              </text>
              <text class="node-stats" :y="simNode.radius + 26" text-anchor="middle">
                {{ statsText(graphNodeMap.get(simNode.id)?.commit!) }}
              </text>
              <!-- マージコミットで未展開の枝がある場合のバッジ -->
              <g
                v-if="
                  (graphNodeMap.get(simNode.id)?.commit?.parentCount ?? 0) >= 2 &&
                  !expandedBranches.has(simNode.id)
                "
                :transform="`translate(${simNode.radius + 4}, -${simNode.radius - 4})`"
              >
                <circle r="8" class="expand-badge" />
                <text class="expand-badge-text" text-anchor="middle" y="4">+</text>
              </g>
            </template>

            <!-- read-more ノード -->
            <template v-else-if="graphNodeMap.get(simNode.id)?.kind === 'read-more'">
              <rect
                :x="-30"
                :y="-14"
                width="60"
                height="28"
                rx="6"
                class="pseudo-node read-more-node"
              />
              <text class="pseudo-node-text" text-anchor="middle" y="5">
                {{ loading ? '...' : 'more' }}
              </text>
            </template>

            <!-- expand-branch ノード -->
            <template v-else-if="graphNodeMap.get(simNode.id)?.kind === 'expand-branch'">
              <rect
                :x="-30"
                :y="-14"
                width="60"
                height="28"
                rx="6"
                class="pseudo-node expand-node"
              />
              <text class="pseudo-node-text" text-anchor="middle" y="5">expand</text>
            </template>
          </g>
        </g>
      </svg>

      <!-- 選択ノードの詳細パネル -->
      <div v-if="selectedCommit !== null" class="detail-panel">
        <div class="detail-header">
          <code class="detail-hash">{{ selectedCommit.hash }}</code>
          <button class="detail-close" @click="selectedNodeId = null">x</button>
        </div>
        <p class="detail-subject">{{ selectedCommit.subject }}</p>
        <p v-if="selectedCommit.body !== ''" class="detail-body">{{ selectedCommit.body }}</p>
        <dl class="detail-meta">
          <dt>Author</dt>
          <dd>{{ selectedCommit.authorName }} &lt;{{ selectedCommit.authorEmail }}&gt;</dd>
          <dt>Date</dt>
          <dd>{{ formatDate(selectedCommit.date) }}</dd>
          <dt>Stats</dt>
          <dd>{{ statsText(selectedCommit) }}</dd>
        </dl>
        <div class="detail-links">
          <router-link :to="diffUrl(selectedCommit)" class="link-btn">diff</router-link>
          <router-link :to="treeUrl(selectedCommit)" class="link-btn">tree</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  height: calc(100vh - var(--header-height, 120px) - 2rem);
  display: flex;
  flex-direction: column;
}
.graph-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
.apply-btn {
  padding: 0.3rem 0.8rem;
  background: var(--color-input-bg);
  color: var(--color-fg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
}
.apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.status-message {
  color: var(--color-fg-muted);
  font-size: 0.9rem;
}
.error {
  color: var(--color-error);
}
.graph-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.graph-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}
.graph-svg:active {
  cursor: grabbing;
}

/* エッジ */
.graph-edge {
  stroke: var(--color-border);
  stroke-width: 1.5;
}

/* ノード */
.graph-node {
  cursor: pointer;
}
.node-circle {
  fill: var(--color-bg);
  stroke: var(--color-border);
  stroke-width: 2;
  transition: stroke 0.15s;
}
.graph-node--mainstream .node-circle {
  stroke: var(--color-fg-muted);
  stroke-width: 2.5;
}
.graph-node--selected .node-circle {
  stroke: var(--color-fg);
  stroke-width: 3;
}
.node-subject {
  font-size: 11px;
  fill: var(--color-fg);
  pointer-events: none;
}
.node-hash {
  font-size: 10px;
  font-family: var(--font-mono);
  fill: var(--color-fg-muted);
  pointer-events: none;
}
.node-meta {
  font-size: 9px;
  fill: var(--color-fg-muted);
  pointer-events: none;
}
.node-stats {
  font-size: 9px;
  fill: var(--color-fg-muted);
  pointer-events: none;
}
.expand-badge {
  fill: var(--color-bg-subtle, var(--color-bg));
  stroke: var(--color-border);
  stroke-width: 1;
}
.expand-badge-text {
  font-size: 11px;
  fill: var(--color-fg-muted);
  pointer-events: none;
}

/* 疑似ノード */
.pseudo-node {
  stroke: var(--color-border);
  stroke-width: 1;
  stroke-dasharray: 4 2;
  cursor: pointer;
}
.read-more-node {
  fill: var(--color-bg);
}
.expand-node {
  fill: var(--color-bg);
}
.pseudo-node-text {
  font-size: 11px;
  fill: var(--color-fg-muted);
  pointer-events: none;
}

/* 詳細パネル */
.detail-panel {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 320px;
  max-height: calc(100% - 2rem);
  overflow-y: auto;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem;
  font-size: 0.85rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.detail-hash {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-close {
  background: none;
  border: none;
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.4rem;
}
.detail-subject {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-fg);
}
.detail-body {
  margin: 0 0 0.5rem;
  color: var(--color-fg-muted);
  white-space: pre-wrap;
  font-size: 0.8rem;
}
.detail-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.5rem;
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
}
.detail-meta dt {
  color: var(--color-fg-muted);
  font-weight: 600;
}
.detail-meta dd {
  margin: 0;
  color: var(--color-fg);
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-links {
  display: flex;
  gap: 0.5rem;
}
.link-btn {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-fg-muted);
  text-decoration: none;
  transition:
    background 0.15s,
    color 0.15s;
}
.link-btn:hover {
  background: var(--color-bg-subtle, var(--color-bg));
  color: var(--color-fg);
}
</style>
