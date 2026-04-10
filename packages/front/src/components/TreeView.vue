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
 */

import type { RefListDto, TreeEntryDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRefs } from '../api/refs.js'
import { fetchTree } from '../api/tree.js'
import RevisionCombobox from './RevisionCombobox.vue'

const WORKTREE_LABEL = '(worktree)' as const

const route = useRoute()
const router = useRouter()

function readRevFromRoute(): string {
  const raw = route.query.rev
  return typeof raw === 'string' && raw !== '' ? raw : WORKTREE_LABEL
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
  try {
    const apiRev = rev === WORKTREE_LABEL ? null : rev
    const result = await fetchTree(apiRev, path)
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
  if (currentRev.value !== WORKTREE_LABEL) {
    query.rev = currentRev.value
  }
  if (currentPath.value !== '') {
    query.path = currentPath.value
  }
  void router.replace({ query })
}

function navigateToDir(path: string): void {
  currentPath.value = path
  syncUrl()
  void loadTree(currentRev.value, path)
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
  fetchRefs('', 50)
    .then((result) => {
      if (isUnmounted) return
      initialRefs.value = result
    })
    .catch((err: unknown) => {
      if (isUnmounted) return
      console.warn('[TreeView] initial fetchRefs failed', err)
    })
})

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<template>
  <div class="tree-view">
    <div class="tree-controls">
      <RevisionCombobox
        :model-value="currentRev"
        :initial-refs="initialRefs"
        :allow-worktree="true"
        placeholder="rev"
        @update:model-value="currentRev = $event"
        @submit="onRevSubmit"
      />
      <button class="apply-btn" :disabled="loading" @click="onApply">apply</button>
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

    <p v-if="errorMessage !== null" class="error">error: {{ errorMessage }}</p>
    <p v-else-if="loading" class="loading">loading...</p>
    <table v-else-if="sortedEntries.length > 0" class="tree-table">
      <thead>
        <tr>
          <th class="col-name">Name</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in sortedEntries"
          :key="entry.path"
          class="tree-row"
          @click="entry.type === 'tree' ? navigateToDir(entry.path) : undefined"
        >
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
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">No entries</p>
  </div>
</template>

<style scoped>
.tree-view {
  max-width: 900px;
}
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
.tree-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border);
  font-family: ui-monospace, monospace;
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
