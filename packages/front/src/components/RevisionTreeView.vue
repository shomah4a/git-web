<script setup lang="ts">
/**
 * ディレクトリツリー表示コンポーネント (ADR 0022)。
 *
 * 設計方針:
 * - RevisionCombobox でリビジョン選択 (デフォルト worktree)
 * - /api/tree でツリー取得 → テーブル形式で表示
 * - ディレクトリクリック → router.push でドリルダウン
 * - パンくずリストで上位ディレクトリへナビゲーション
 * - URL の rev / path クエリでステート管理
 * - blob 行の Last commit msg/date セルから /commits?rev=&path= へリンク (ADR 0056)
 */

import type { LastCommitDto, RefListDto, TreeEntryDto, TreeEntryStatusDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import { fetchRefs } from '../api/refs.js'
import { renderMarkdown } from '../markdown/render.js'
import { fetchTree } from '../api/tree.js'
import { fetchTreeCommits } from '../api/tree-commits.js'
import { createYmdFormatter, detectBrowserTimeZone } from '../format/date.js'
import { formatMode, formatSize } from '../format/entry.js'
import HistoryLinkCell from './HistoryLinkCell.vue'
import { buildHistoryUrl } from './history-url.js'
import RevisionCombobox from './RevisionCombobox.vue'

const route = useRoute()
const router = useRouter()

function readRevFromRoute(): string {
  const raw = route.query.rev
  return typeof raw === 'string' && raw !== '' ? raw : 'HEAD'
}

function readPathFromRoute(): string {
  const raw = route.query.path
  return typeof raw === 'string' ? raw : ''
}

const currentRev = ref<string>(readRevFromRoute())
const currentPath = ref<string>(readPathFromRoute())
const entries = ref<ReadonlyArray<TreeEntryDto>>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const initialRefs = ref<RefListDto | null>(null)

/**
 * README 検出の優先順位 (case-insensitive)。
 */
const README_PATTERNS = ['readme.md', 'readme', 'readme.txt']

type ReadmeState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly name: string; readonly html: string }

const readmeState = ref<ReadmeState>({ kind: 'none' })

/**
 * 各エントリの最終コミット情報マップ (ADR 0054)。
 *
 * tree 表示後に /api/tree-commits を遅延フェッチし結果をここに格納する。
 * entries とは独立した ref に持ち、テンプレで name でルックアップして表示する。
 */
const lastCommitByName = ref<ReadonlyMap<string, LastCommitDto>>(new Map())

const formatYmd = createYmdFormatter(detectBrowserTimeZone())

let isUnmounted = false
let generation = 0

/**
 * パンくずリスト用のセグメント分解。
 * 'src/components' → [{name: 'src', path: 'src'}, {name: 'components', path: 'src/components'}]
 */
const breadcrumbs = computed(() => {
  if (currentPath.value === '') return []
  const segments = currentPath.value.split('/')
  const result: { name: string; path: string }[] = []
  for (let i = 0; i < segments.length; i++) {
    result.push({
      name: segments[i] ?? '',
      path: segments.slice(0, i + 1).join('/'),
    })
  }
  return result
})

/**
 * エントリをソート済みで返す。ディレクトリ優先、同種内はアルファベット順。
 */
const sortedEntries = computed(() => {
  return [...entries.value].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'tree' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})

async function loadTree(rev: string, path: string): Promise<void> {
  const gen = ++generation
  loading.value = true
  errorMessage.value = null
  readmeState.value = { kind: 'none' }
  lastCommitByName.value = new Map()
  try {
    const result = await fetchTree(rev, path)
    if (isUnmounted || gen !== generation) return
    entries.value = result
    // README 検出・取得 (世代チェック付き)
    void loadReadme(gen, rev, result)
    // 最終コミット情報の遅延フェッチ (世代チェック付き、失敗しても tree 表示は維持)
    void loadTreeCommits(gen, rev, path)
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
    entries.value = []
  } finally {
    if (!isUnmounted && gen === generation) {
      loading.value = false
    }
  }
}

/**
 * /api/tree-commits を呼び、各エントリの最終コミット情報を lastCommitByName に格納する。
 *
 * - 失敗時はコンソール warn のみ。ツリー自体の表示は維持する (ADR 0054 §9)
 * - 世代チェックで古いリクエストの結果が新しい表示を上書きしないよう守る
 */
async function loadTreeCommits(gen: number, rev: string, path: string): Promise<void> {
  try {
    const result = await fetchTreeCommits(rev, path)
    if (isUnmounted || gen !== generation) return
    const map = new Map<string, LastCommitDto>()
    for (const entry of result) {
      if (entry.lastCommit !== null) {
        map.set(entry.name, entry.lastCommit)
      }
    }
    lastCommitByName.value = map
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    console.warn('[RevisionTreeView] fetchTreeCommits failed', err)
  }
}

/**
 * ツリー内の README を検出し、取得してレンダ��ングする。
 */
async function loadReadme(
  gen: number,
  rev: string,
  treeEntries: ReadonlyArray<TreeEntryDto>,
): Promise<void> {
  const readmeEntry = findReadme(treeEntries)
  if (readmeEntry === null) {
    readmeState.value = { kind: 'none' }
    return
  }

  readmeState.value = { kind: 'loading' }
  try {
    const blob = await fetchBlob(readmeEntry.path, rev)
    if (isUnmounted || gen !== generation) return
    if (blob === null || blob.binary) {
      readmeState.value = { kind: 'none' }
      return
    }
    const name = readmeEntry.name
    const isMarkdown =
      name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown')
    let html: string
    if (isMarkdown) {
      html = await renderMarkdown(blob.content, 'readme-mermaid')
    } else {
      // プレーンテキストは pre で表示
      const escaped = blob.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      html = `<pre>${escaped}</pre>`
    }
    if (isUnmounted || gen !== generation) return
    readmeState.value = { kind: 'success', name, html }
  } catch {
    if (isUnmounted || gen !== generation) return
    readmeState.value = { kind: 'none' }
  }
}

/**
 * ツリーエントリから README を優先順位に従って検出する。
 */
function findReadme(treeEntries: ReadonlyArray<TreeEntryDto>): TreeEntryDto | null {
  for (const pattern of README_PATTERNS) {
    const found = treeEntries.find((e) => e.type === 'blob' && e.name.toLowerCase() === pattern)
    if (found !== undefined) return found
  }
  return null
}

function syncUrl(): void {
  const query: Record<string, string> = {}
  if (currentRev.value !== '') {
    query.rev = currentRev.value
  }
  if (currentPath.value !== '') {
    query.path = currentPath.value
  }
  void router.push({ query })
}

function navigateToDir(path: string): void {
  currentPath.value = path
  syncUrl()
  void loadTree(currentRev.value, path)
}

function navigateToBlob(path: string): void {
  void router.push({
    path: '/blob',
    query: {
      rev: currentRev.value,
      path,
    },
  })
}

function navigateToRoot(): void {
  navigateToDir('')
}

function onRevSubmit(): void {
  syncUrl()
  void loadTree(currentRev.value, currentPath.value)
}

function onApply(): void {
  if (loading.value) return
  syncUrl()
  void loadTree(currentRev.value, currentPath.value)
}

// route.query の変更 (back/forward) に追従
watch(
  () => route.query,
  () => {
    const rev = readRevFromRoute()
    const path = readPathFromRoute()
    if (rev === currentRev.value && path === currentPath.value) return
    currentRev.value = rev
    currentPath.value = path
    void loadTree(rev, path)
  },
)

onMounted(() => {
  void loadTree(currentRev.value, currentPath.value)
  fetchRefs('')
    .then((result) => {
      if (isUnmounted) return
      initialRefs.value = result
    })
    .catch((err: unknown) => {
      if (isUnmounted) return
      console.warn('[RevisionTreeView] initial fetchRefs failed', err)
    })
})

function statusLabel(status: TreeEntryStatusDto): string {
  if (status === 'added') return 'A'
  if (status === 'modified') return 'M'
  if (status === 'deleted') return 'D'
  if (status === 'untracked') return '?'
  return ''
}

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<template>
  <div class="tree-view">
    <Teleport to="#page-header-slot">
      <div class="page-header-content">
        <div class="tree-controls">
          <RevisionCombobox
            :model-value="currentRev"
            :initial-refs="initialRefs"
            :allow-worktree="false"
            placeholder="rev"
            @update:model-value="currentRev = $event"
            @submit="onRevSubmit"
          />
          <button class="apply-btn" :disabled="loading" @click="onApply">適用</button>
        </div>

        <nav class="breadcrumb" aria-label="directory path">
          <button class="breadcrumb-item" @click="navigateToRoot">/</button>
          <template v-for="crumb in breadcrumbs" :key="crumb.path">
            <span class="breadcrumb-sep">/</span>
            <button class="breadcrumb-item" @click="navigateToDir(crumb.path)">
              {{ crumb.name }}
            </button>
          </template>
        </nav>
      </div>
    </Teleport>

    <p v-if="errorMessage !== null" class="error">error: {{ errorMessage }}</p>
    <p v-else-if="loading" class="loading">loading...</p>
    <table v-else-if="sortedEntries.length > 0" class="tree-table">
      <thead>
        <tr>
          <th class="col-name">Name</th>
          <th class="col-commit-msg">Last commit message</th>
          <th class="col-commit-date">Last commit date</th>
          <th class="col-mode">Mode</th>
          <th class="col-size">Size</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in sortedEntries"
          :key="entry.path"
          class="tree-row"
          @click="entry.type === 'tree' ? navigateToDir(entry.path) : navigateToBlob(entry.path)"
        >
          <td class="col-name">
            <span class="entry-icon">{{ entry.type === 'tree' ? '📁' : '📄' }}</span>
            <button
              v-if="entry.type === 'tree'"
              class="entry-link"
              @click.stop="navigateToDir(entry.path)"
            >
              {{ entry.name }}
            </button>
            <button v-else class="entry-link" @click.stop="navigateToBlob(entry.path)">
              {{ entry.name }}
            </button>
            <span v-if="entry.status !== null" class="entry-status" :data-status="entry.status">
              {{ statusLabel(entry.status) }}
            </span>
          </td>
          <td class="col-commit-msg" :title="lastCommitByName.get(entry.name)?.subject ?? ''">
            <HistoryLinkCell
              v-if="lastCommitByName.get(entry.name)"
              :to="buildHistoryUrl(currentRev, entry.path)"
            >
              {{ lastCommitByName.get(entry.name)?.subject }}
            </HistoryLinkCell>
            <template v-else>
              {{ lastCommitByName.get(entry.name)?.subject ?? '—' }}
            </template>
          </td>
          <td class="col-commit-date">
            <HistoryLinkCell
              v-if="lastCommitByName.get(entry.name)"
              :to="buildHistoryUrl(currentRev, entry.path)"
            >
              {{ formatYmd(lastCommitByName.get(entry.name)!.date) }}
            </HistoryLinkCell>
            <template v-else>
              {{
                lastCommitByName.get(entry.name)
                  ? formatYmd(lastCommitByName.get(entry.name)!.date)
                  : '—'
              }}
            </template>
          </td>
          <td class="col-mode">{{ formatMode(entry) }}</td>
          <td class="col-size">{{ formatSize(entry) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">No entries</p>

    <section v-if="readmeState.kind === 'loading'" class="readme-section">
      <p class="loading">loading README...</p>
    </section>
    <section v-else-if="readmeState.kind === 'success'" class="readme-section">
      <h3 class="readme-header">{{ readmeState.name }}</h3>
      <!--
        例外的に v-html を使用する。値は DOMPurify.sanitize() 通過済みであり、
        未サニタイズの文字列が渡されることはない (ADR 0028)。
        v-html の使用は本プロジェクトにおいて例外中の例外であり、
        DOMPurify 等による確実なサニタイズなしに使用してはならない。
      -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="markdown-body" v-html="readmeState.html"></div>
    </section>
  </div>
</template>

<style scoped>
.tree-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
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
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.breadcrumb-item {
  background: none;
  border: none;
  color: var(--color-fg);
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  font-family: inherit;
  font-size: inherit;
  text-decoration: underline;
  text-decoration-color: var(--color-border);
}
.breadcrumb-item:hover {
  color: var(--color-fg-muted);
}
.breadcrumb-sep {
  color: var(--color-fg-faint);
  margin: 0 0.1rem;
}
.tree-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.tree-table thead {
  background: var(--color-surface-1);
}
.tree-table th {
  text-align: left;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-fg-muted);
  font-weight: normal;
  font-size: 0.85rem;
}
.tree-row {
  border-bottom: 1px solid var(--color-border-subtle);
}
.tree-row:hover {
  background: var(--color-surface-hover);
}
.col-name {
  padding: 0.35rem 0.75rem;
  display: flex;
  align-items: center;
}
.col-commit-msg {
  padding: 0.35rem 0.75rem;
  color: var(--color-fg-muted);
  font-size: 0.85em;
  max-width: 24rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-commit-date {
  padding: 0.35rem 0.75rem;
  white-space: nowrap;
  color: var(--color-fg-muted);
  font-size: 0.85em;
}
.col-mode {
  padding: 0.35rem 0.75rem;
  white-space: nowrap;
  color: var(--color-fg-muted);
  font-size: 0.85em;
  text-align: right;
}
.col-size {
  padding: 0.35rem 0.75rem;
  white-space: nowrap;
  text-align: right;
  color: var(--color-fg-muted);
  font-size: 0.85em;
}
.entry-icon {
  margin-right: 0.5rem;
}
.entry-link {
  background: none;
  border: none;
  color: var(--color-fg);
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  text-decoration: none;
}
.entry-link:hover {
  text-decoration: underline;
}
.entry-status {
  margin-left: auto;
  font-weight: bold;
  font-size: 0.85em;
}
.entry-status[data-status='added'] {
  color: var(--color-status-added);
}
.entry-status[data-status='modified'] {
  color: var(--color-status-modified);
}
.entry-status[data-status='deleted'] {
  color: var(--color-error);
}
.entry-status[data-status='untracked'] {
  color: var(--color-fg-faint);
}
.error {
  color: var(--color-error);
}
.loading {
  color: var(--color-fg-muted);
}
.empty {
  color: var(--color-fg-muted);
}
.readme-section {
  margin-top: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}
.readme-header {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-weight: normal;
  background: var(--color-surface-1);
  border-bottom: 1px solid var(--color-border);
}
</style>
