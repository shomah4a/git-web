<script setup lang="ts">
/**
 * worktree 状態表示コンポーネント (ADR 0023)。
 *
 * 設計方針:
 * - /api/worktree でエントリ取得 → テーブル形式で表示
 * - カラム: Status | Name | Mode | Size
 * - ディレクトリクリック → router.push でドリルダウン
 * - パンくずリストで上位ディレクトリへナビゲーション
 * - URL の path クエリでステート管理
 */

import type { WorktreeEntryDto, WorktreeEntryStatusDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWorktree } from '../api/worktree.js'

const route = useRoute()
const router = useRouter()

function readPathFromRoute(): string {
  const raw = route.query.path
  return typeof raw === 'string' ? raw : ''
}

const currentPath = ref<string>(readPathFromRoute())
const entries = ref<ReadonlyArray<WorktreeEntryDto>>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

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

async function loadWorktree(path: string): Promise<void> {
  const gen = ++generation
  loading.value = true
  errorMessage.value = null
  try {
    const result = await fetchWorktree(path)
    if (isUnmounted || gen !== generation) return
    entries.value = result
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

function syncUrl(): void {
  const query: Record<string, string> = {}
  if (currentPath.value !== '') {
    query.path = currentPath.value
  }
  void router.replace({ query })
}

function navigateToDir(path: string): void {
  currentPath.value = path
  syncUrl()
  void loadWorktree(path)
}

function navigateToRoot(): void {
  navigateToDir('')
}

watch(
  () => route.query,
  () => {
    const path = readPathFromRoute()
    if (path === currentPath.value) return
    currentPath.value = path
    void loadWorktree(path)
  },
)

onMounted(() => {
  void loadWorktree(currentPath.value)
})

onBeforeUnmount(() => {
  isUnmounted = true
})

function statusLabel(status: WorktreeEntryStatusDto): string {
  if (status === 'added') return 'A'
  if (status === 'modified') return 'M'
  if (status === 'deleted') return 'D'
  if (status === 'untracked') return '?'
  return ''
}

function formatSize(size: number | null): string {
  if (size === null) return '-'
  if (size < 1024) return `${size.toString()} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatMode(mode: string | null): string {
  if (mode === null) return '-'
  return mode
}
</script>

<template>
  <div class="worktree-view">
    <nav class="breadcrumb" aria-label="directory path">
      <button class="breadcrumb-item" @click="navigateToRoot">/</button>
      <template v-for="crumb in breadcrumbs" :key="crumb.path">
        <span class="breadcrumb-sep">/</span>
        <button class="breadcrumb-item" @click="navigateToDir(crumb.path)">
          {{ crumb.name }}
        </button>
      </template>
    </nav>

    <p v-if="errorMessage !== null" class="error">error: {{ errorMessage }}</p>
    <p v-else-if="loading" class="loading">loading...</p>
    <table v-else-if="sortedEntries.length > 0" class="worktree-table">
      <thead>
        <tr>
          <th class="col-status">Status</th>
          <th class="col-name">Name</th>
          <th class="col-mode">Mode</th>
          <th class="col-size">Size</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in sortedEntries"
          :key="entry.path"
          class="worktree-row"
          @click="entry.type === 'tree' ? navigateToDir(entry.path) : undefined"
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
            <span v-else class="entry-name">{{ entry.name }}</span>
          </td>
          <td class="col-mode">{{ formatMode(entry.mode) }}</td>
          <td class="col-size">{{ formatSize(entry.size) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">No entries</p>
  </div>
</template>

<style scoped>
.worktree-view {
  max-width: 900px;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 0.5rem;
  font-family: ui-monospace, monospace;
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
  font-family: ui-monospace, monospace;
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
.col-mode {
  width: 5rem;
  padding: 0.35rem 0.75rem;
  color: var(--color-fg-muted);
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
.entry-name {
  color: var(--color-fg);
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
