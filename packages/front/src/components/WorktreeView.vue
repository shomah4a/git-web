<script setup lang="ts">
/**
 * worktree 状態表示コンポーネント (ADR 0023 / ADR 0055)。
 *
 * 設計方針:
 * - /api/worktree でエントリ取得 → テーブル形式で表示
 * - カラム: Status | Name | Last commit message | Last commit date | Mode | Size
 * - ディレクトリクリック → router.push でドリルダウン
 * - パンくずリストで上位ディレクトリへナビゲーション
 * - URL の path / wt クエリでステート管理
 * - ADR 0055: WorktreeCombobox で worktree 切替。選択 = 即適用、path はリセット
 */

import type {
  LastCommitDto,
  WorktreeEntryDto,
  WorktreeEntryStatusDto,
  WorktreeListItemDto,
} from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchTreeCommits } from '../api/tree-commits.js'
import { fetchWorktree } from '../api/worktree.js'
import { fetchWorktreesList } from '../api/worktrees-list.js'
import { createYmdFormatter, detectBrowserTimeZone } from '../format/date.js'
import { formatMode, formatSize } from '../format/entry.js'
import WorktreeCombobox from './WorktreeCombobox.vue'

const route = useRoute()
const router = useRouter()

function readPathFromRoute(): string {
  const raw = route.query.path
  return typeof raw === 'string' ? raw : ''
}

function readWtFromRoute(): string | null {
  const raw = route.query.wt
  if (typeof raw !== 'string' || raw === '') return null
  return raw
}

const currentPath = ref<string>(readPathFromRoute())
const currentWt = ref<string | null>(readWtFromRoute())
const entries = ref<ReadonlyArray<WorktreeEntryDto>>([])
const worktrees = ref<ReadonlyArray<WorktreeListItemDto>>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * 各エントリの最終コミット情報マップ (ADR 0054)。
 *
 * worktree 表示でも HEAD 基準で最終コミットを併記する。
 * 未追跡ファイルは履歴に出ないため null となり UI で `—` 表示になる。
 */
const lastCommitByName = ref<ReadonlyMap<string, LastCommitDto>>(new Map())

const formatYmd = createYmdFormatter(detectBrowserTimeZone())

let isUnmounted = false
let generation = 0

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

const sortedEntries = computed(() => {
  return [...entries.value].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'tree' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})

async function loadWorktree(path: string, wt: string | null): Promise<void> {
  const gen = ++generation
  loading.value = true
  errorMessage.value = null
  lastCommitByName.value = new Map()
  try {
    const result = await fetchWorktree(path, wt)
    if (isUnmounted || gen !== generation) return
    entries.value = result
    // 最終コミット情報の遅延フェッチ (失敗しても worktree 表示は維持、ADR 0054 §9)
    void loadTreeCommits(gen, path, wt)
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
 * /api/tree-commits を rev=null (worktree=HEAD) で呼び、エントリの最終コミット情報を格納する。
 */
async function loadTreeCommits(gen: number, path: string, wt: string | null): Promise<void> {
  try {
    const result = await fetchTreeCommits(null, path, wt)
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
    console.warn('[WorktreeView] fetchTreeCommits failed', err)
  }
}

async function loadWorktreesList(): Promise<void> {
  try {
    const items = await fetchWorktreesList()
    if (isUnmounted) return
    worktrees.value = items
  } catch (err) {
    if (isUnmounted) return
    console.warn('[WorktreeView] fetchWorktreesList failed', err)
  }
}

function syncUrl(): void {
  const query: Record<string, string> = {}
  if (currentPath.value !== '') {
    query.path = currentPath.value
  }
  if (currentWt.value !== null) {
    query.wt = currentWt.value
  }
  void router.push({ query })
}

function navigateToDir(path: string): void {
  currentPath.value = path
  syncUrl()
  void loadWorktree(path, currentWt.value)
}

function navigateToBlob(path: string): void {
  const query: Record<string, string> = { path }
  if (currentWt.value !== null) {
    query.wt = currentWt.value
  }
  void router.push({
    path: '/wt/blob',
    query,
  })
}

function navigateToRoot(): void {
  navigateToDir('')
}

/**
 * worktree selector の確定。
 *
 * ADR 0055 §4: 切替時は path を `''` にリセットする (切替先で同一相対 path が
 * 存在する保証がないため)。
 */
function onWorktreeSubmit(next: string | null): void {
  if (next === currentWt.value) return
  currentWt.value = next
  currentPath.value = ''
  syncUrl()
  // worktrees list 自体は変わらない (TTL 内なら再取得不要) ので再フェッチしない
  void loadWorktree('', next)
}

watch(
  () => route.query,
  () => {
    const path = readPathFromRoute()
    const wt = readWtFromRoute()
    if (path === currentPath.value && wt === currentWt.value) return
    currentPath.value = path
    currentWt.value = wt
    void loadWorktree(path, wt)
  },
)

onMounted(() => {
  void loadWorktreesList()
  void loadWorktree(currentPath.value, currentWt.value)
})

onBeforeUnmount(() => {
  isUnmounted = true
})

function statusLabel(status: WorktreeEntryStatusDto): string {
  if (status === 'added') return 'A'
  if (status === 'modified') return 'M'
  if (status === 'deleted') return 'D'
  if (status === 'untracked') return '?'
  if (status === 'ignored') return 'I'
  return ''
}
</script>

<template>
  <div class="worktree-view">
    <Teleport to="#page-header-slot">
      <div class="page-header-content">
        <div v-if="worktrees.length > 0" class="worktree-controls">
          <WorktreeCombobox
            :model-value="currentWt"
            :items="worktrees"
            @submit="onWorktreeSubmit"
          />
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
    <table v-else-if="sortedEntries.length > 0" class="worktree-table">
      <thead>
        <tr>
          <th class="col-status">Status</th>
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
          class="worktree-row"
          @click="entry.type === 'tree' ? navigateToDir(entry.path) : navigateToBlob(entry.path)"
        >
          <td class="col-status">
            <span v-if="entry.status !== null" class="entry-status" :data-status="entry.status">{{
              statusLabel(entry.status)
            }}</span>
          </td>
          <td class="col-name">
            <span class="entry-icon">{{
              entry.type === 'tree' ? '\uD83D\uDCC1' : '\uD83D\uDCC4'
            }}</span>
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
          </td>
          <td class="col-commit-msg" :title="lastCommitByName.get(entry.name)?.subject ?? ''">
            {{ lastCommitByName.get(entry.name)?.subject ?? '\u2014' }}
          </td>
          <td class="col-commit-date">
            {{
              lastCommitByName.get(entry.name)
                ? formatYmd(lastCommitByName.get(entry.name)!.date)
                : '\u2014'
            }}
          </td>
          <td class="col-mode">{{ formatMode(entry) }}</td>
          <td class="col-size">{{ formatSize(entry) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">No entries</p>
  </div>
</template>

<style scoped>
.page-header-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.worktree-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0.4rem 0;
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
.worktree-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.worktree-table thead {
  background: var(--color-surface-1);
}
.worktree-table th {
  text-align: left;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-fg-muted);
  font-weight: normal;
  font-size: 0.85rem;
}
.worktree-row {
  border-bottom: 1px solid var(--color-border-subtle);
}
.worktree-row:hover {
  background: var(--color-surface-hover);
}
.col-status {
  width: 3rem;
  text-align: center;
  padding: 0.35rem 0.5rem;
}
.col-name {
  padding: 0.35rem 0.75rem;
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
  width: 7rem;
  padding: 0.35rem 0.75rem;
  color: var(--color-fg-muted);
  text-align: right;
}
.col-size {
  width: 6rem;
  padding: 0.35rem 0.75rem;
  text-align: right;
  color: var(--color-fg-muted);
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
.entry-status[data-status='ignored'] {
  color: var(--color-fg-faint);
  opacity: 0.7;
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
</style>
