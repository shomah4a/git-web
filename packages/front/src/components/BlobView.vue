<script setup lang="ts">
/**
 * revision 用ファイル内容表示コンポーネント (ADR 0028, ADR 0038)。
 *
 * 設計方針:
 * - /blob?rev=<rev>&path=<path> で表示対象を指定
 * - fetchBlob で内容取得、BlobContent で表示を委譲
 * - パンくずリストで /tree (revision ツリー) へのナビゲーション
 */

import type { BlobDto } from '@git-web/common'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import { highlighterKey } from '../diff/highlighter/types.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import { renderMarkdown } from '../markdown/render.js'
import BlobContent from './BlobContent.vue'
import type { BlobContentState } from './BlobContent.vue'

const route = useRoute()
const router = useRouter()
const highlighter = inject(highlighterKey, () => createNoOpHighlighter(), true)

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(path.substring(dot).toLowerCase())
}

const state = ref<BlobContentState>({ kind: 'loading' })
let isUnmounted = false
let generation = 0

function readRevFromRoute(): string {
  const raw = route.query.rev
  return typeof raw === 'string' && raw !== '' ? raw : 'HEAD'
}

function readPathFromRoute(): string {
  const raw = route.query.path
  return typeof raw === 'string' ? raw : ''
}

const currentRev = computed(() => readRevFromRoute())
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

async function loadBlob(rev: string, path: string): Promise<void> {
  const gen = ++generation
  state.value = { kind: 'loading' }

  try {
    const blob = await fetchBlob(path, rev)
    if (isUnmounted || gen !== generation) return

    if (blob === null) {
      state.value = { kind: 'not-found' }
      return
    }

    const resolved = await resolveBlobState(blob, path, rev, gen)
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

async function resolveBlobState(
  blob: BlobDto,
  path: string,
  rev: string,
  gen: number,
): Promise<BlobContentState | null> {
  if (blob.binary) {
    if (isImagePath(path)) {
      const params = new URLSearchParams()
      params.set('path', path)
      params.set('rev', rev)
      return { kind: 'image', rawUrl: `/api/blob/raw?${params.toString()}` }
    }
    return { kind: 'binary', path: blob.path }
  }

  const lines = blob.content.split('\n')
  let tokens = null
  let renderedMarkdown = null

  if (blob.language !== null) {
    try {
      tokens = await highlighter.highlightFile(blob.content, blob.language)
    } catch {
      // トークン化失敗はプレーン fallback
    }
  }

  if (isUnmounted || gen !== generation) return null

  const name = fileName.value.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    try {
      renderedMarkdown = await renderMarkdown(blob.content, 'blob-mermaid')
    } catch {
      // レンダリング失敗はソース表示にフォールバック
    }
  }

  if (isUnmounted || gen !== generation) return null

  return {
    kind: 'success',
    path: blob.path,
    content: blob.content,
    binary: blob.binary,
    language: blob.language,
    lines,
    tokens,
    renderedMarkdown,
  }
}

function navigateToTree(path: string): void {
  void router.push({
    path: '/tree',
    query: {
      rev: currentRev.value,
      ...(path !== '' ? { path } : {}),
    },
  })
}

watch(
  () => route.query,
  () => {
    if (route.name !== 'blob') return
    void loadBlob(readRevFromRoute(), readPathFromRoute())
  },
)

onMounted(() => {
  void loadBlob(currentRev.value, currentPath.value)
})

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<template>
  <div class="blob-view">
    <Teleport to="#page-header-slot">
      <nav class="breadcrumb" aria-label="file path">
        <button class="breadcrumb-item" @click="navigateToTree('')">/</button>
        <template v-for="crumb in breadcrumbs" :key="crumb.path">
          <span class="breadcrumb-sep">/</span>
          <button v-if="!crumb.isFile" class="breadcrumb-item" @click="navigateToTree(crumb.path)">
            {{ crumb.name }}
          </button>
          <span v-else class="breadcrumb-current">{{ crumb.name }}</span>
        </template>
        <span class="breadcrumb-rev">@ {{ currentRev }}</span>
      </nav>
    </Teleport>

    <BlobContent :state="state" :file-name="fileName" @navigate-back="navigateToTree('')" />
  </div>
</template>

<style scoped>
.blob-view {
  max-width: 900px;
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
