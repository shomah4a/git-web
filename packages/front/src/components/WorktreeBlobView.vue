<script setup lang="ts">
/**
 * worktree 用ファイル内容表示コンポーネント (ADR 0038 / ADR 0055 / ADR 0056)。
 *
 * 設計方針:
 * - /wt/blob?path=<path>&wt=<wt> で表示対象を指定 (rev なし = worktree)
 * - fetchBlob(path, null, wt) で worktree の blob を取得
 * - BlobContent で表示を委譲
 * - パンくずリストで / (worktree ツリー) へのナビゲーション
 * - selector はここには置かず WorktreeView から切替える (ADR 0055 §UI / M2)
 * - 右上ツールバーに history リンク (ADR 0056)。
 *   wt=null: rev 省略 (HEAD) で即時 enabled。
 *   wt=<name>: /api/worktrees の resolve 完了まで disabled。
 */

import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WorktreeListItemDto } from '@git-web/common'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import { fetchWorktreesList } from '../api/worktrees-list.js'
import { highlighterKey } from '../diff/highlighter/types.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import BlobContent from './BlobContent.vue'
import type { BlobContentState } from './blob-content-state.js'
import { resolveBlobContent } from './blob-content-state.js'
import { buildHistoryUrl, resolveHistoryRev } from './history-url.js'
import { useChromeless } from './use-chromeless.js'

const route = useRoute()
const router = useRouter()
const highlighter = inject(highlighterKey, () => createNoOpHighlighter(), true)
const { isChromeless, toggleChromeless } = useChromeless()

const state = ref<BlobContentState>({ kind: 'loading' })
let isUnmounted = false
let generation = 0

function readPathFromRoute(): string {
  const raw = route.query.path
  return typeof raw === 'string' ? raw : ''
}

function readWtFromRoute(): string | null {
  const raw = route.query.wt
  if (typeof raw !== 'string' || raw === '') return null
  return raw
}

const currentPath = computed(() => readPathFromRoute())
const currentWt = computed(() => readWtFromRoute())

/**
 * /api/worktrees の取得結果。history リンクの rev 解決にのみ使う (ADR 0056 §4)。
 * 未取得 (null) は「リンク disabled」状態を意味する。
 */
const worktrees = ref<ReadonlyArray<WorktreeListItemDto> | null>(null)

/**
 * history リンクの rev クエリに渡す値 (ADR 0056)。詳細は `resolveHistoryRev` を参照。
 */
const historyRev = computed<string | null>(() =>
  resolveHistoryRev(currentWt.value, worktrees.value),
)

const canShowHistoryLink = computed<boolean>(() => {
  if (currentPath.value === '') return false
  if (currentWt.value === null) return true
  return historyRev.value !== null && historyRev.value !== ''
})

const fileName = computed(() => {
  const p = currentPath.value
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.substring(idx + 1) : p
})

/**
 * パンくずリスト用のセグメント分解。
 */
const breadcrumbs = computed(() => {
  const p = currentPath.value
  if (p === '') return []
  const segments = p.split('/')
  const result: { name: string; path: string; isFile: boolean }[] = []
  for (let i = 0; i < segments.length; i++) {
    result.push({
      name: segments[i] ?? '',
      path: segments.slice(0, i + 1).join('/'),
      isFile: i === segments.length - 1,
    })
  }
  return result
})

async function loadBlob(path: string, wt: string | null): Promise<void> {
  const gen = ++generation
  state.value = { kind: 'loading' }

  try {
    const blob = await fetchBlob(path, null, wt)
    if (isUnmounted || gen !== generation) return

    if (blob === null) {
      state.value = { kind: 'not-found' }
      return
    }

    const resolved = await resolveBlobContent(
      blob,
      path,
      null,
      highlighter,
      () => isUnmounted || gen !== generation,
    )
    if (resolved !== null) {
      state.value = resolved
    }
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    state.value = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    }
  }
}

function navigateToWorktree(path: string): void {
  const query: Record<string, string> = {}
  if (path !== '') query.path = path
  if (currentWt.value !== null) query.wt = currentWt.value
  void router.push({
    path: '/',
    query,
  })
}

watch(
  () => [route.query.path, route.query.wt],
  () => {
    if (route.name !== 'worktree-blob') return
    void loadBlob(readPathFromRoute(), readWtFromRoute())
  },
)

async function loadWorktreesList(): Promise<void> {
  try {
    const items = await fetchWorktreesList()
    if (isUnmounted) return
    worktrees.value = items
  } catch (err) {
    if (isUnmounted) return
    console.warn('[WorktreeBlobView] fetchWorktreesList failed', err)
  }
}

onMounted(() => {
  void loadBlob(currentPath.value, currentWt.value)
  void loadWorktreesList()
})

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<template>
  <div class="blob-view">
    <Teleport to="#page-header-slot">
      <nav class="breadcrumb" aria-label="file path">
        <button class="breadcrumb-item" @click="navigateToWorktree('')">/</button>
        <template v-for="crumb in breadcrumbs" :key="crumb.path">
          <span class="breadcrumb-sep">/</span>
          <button
            v-if="!crumb.isFile"
            class="breadcrumb-item"
            @click="navigateToWorktree(crumb.path)"
          >
            {{ crumb.name }}
          </button>
          <span v-else class="breadcrumb-current">{{ crumb.name }}</span>
        </template>
        <span class="breadcrumb-rev">@ worktree</span>
      </nav>
    </Teleport>

    <div class="blob-toolbar">
      <router-link
        v-if="canShowHistoryLink"
        class="toolbar-button"
        :to="buildHistoryUrl(historyRev, currentPath)"
        title="このファイルの履歴を表示"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      </router-link>
      <span
        v-else-if="currentPath !== ''"
        class="toolbar-button toolbar-button-disabled"
        title="worktree 情報の取得中"
        aria-disabled="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      </span>
      <button
        class="toolbar-button"
        :title="isChromeless ? 'ナビゲーションを表示' : '印刷用表示'"
        @click="toggleChromeless"
      >
        <svg
          v-if="!isChromeless"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path
            d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
          ></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <BlobContent
      :state="state"
      :file-name="fileName"
      :chromeless="isChromeless"
      @navigate-back="navigateToWorktree('')"
    />
  </div>
</template>

<style scoped>
.blob-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  padding: 0.4rem 0;
}
.toolbar-button {
  display: inline-flex;
  align-items: center;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  text-decoration: none;
}
.toolbar-button:hover {
  color: var(--color-fg);
  border-color: var(--color-fg-muted);
}
.toolbar-button-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar-button-disabled:hover {
  color: var(--color-fg-muted);
  border-color: var(--color-border);
}
@media print {
  .blob-toolbar {
    display: none;
  }
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
.breadcrumb-current {
  padding: 0.1rem 0.2rem;
  font-weight: bold;
}
.breadcrumb-rev {
  margin-left: 0.5rem;
  color: var(--color-fg-faint);
  font-size: 0.85em;
}
</style>
