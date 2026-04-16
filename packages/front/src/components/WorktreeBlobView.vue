<script setup lang="ts">
/**
 * worktree 用ファイル内容表示コンポーネント (ADR 0038)。
 *
 * 設計方針:
 * - /wt/blob?path=<path> で表示対象を指定 (rev なし = worktree)
 * - fetchBlob(path, null) で worktree の blob を取得
 * - BlobContent で表示を委譲
 * - パンくずリストで / (worktree ツリー) へのナビゲーション
 */

import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import { highlighterKey } from '../diff/highlighter/types.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import BlobContent from './BlobContent.vue'
import type { BlobContentState } from './blob-content-state.js'
import { resolveBlobContent } from './blob-content-state.js'
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

const currentPath = computed(() => readPathFromRoute())

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

async function loadBlob(path: string): Promise<void> {
  const gen = ++generation
  state.value = { kind: 'loading' }

  try {
    const blob = await fetchBlob(path, null)
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
  void router.push({
    path: '/',
    query: path !== '' ? { path } : {},
  })
}

watch(
  () => route.query.path,
  () => {
    if (route.name !== 'worktree-blob') return
    void loadBlob(readPathFromRoute())
  },
)

onMounted(() => {
  void loadBlob(currentPath.value)
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
      <button
        class="chromeless-toggle"
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
  padding: 0.4rem 0;
}
.chromeless-toggle {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
}
.chromeless-toggle:hover {
  color: var(--color-fg);
  border-color: var(--color-fg-muted);
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
