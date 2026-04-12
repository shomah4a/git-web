<script setup lang="ts">
/**
 * ファイル内容表示コンポーネント (ADR 0028)。
 *
 * 設計方針:
 * - /blob?rev=<rev>&path=<path> で表示対象を指定
 * - fetchBlob で内容取得、Shiki でシンタックスハイライト (DiffView 流用)
 * - Markdown は marked + DOMPurify でレンダリング、Mermaid 対応
 * - パンくずリストでツリーへのナビゲーション
 */

import type { BlobDto } from '@git-web/common'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import type { HighlightedLines, HighlightedToken } from '../diff/highlighter/types.js'
import { highlighterKey } from '../diff/highlighter/types.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import { renderMarkdown } from '../markdown/render.js'

const route = useRoute()
const router = useRouter()
const highlighter = inject(highlighterKey, () => createNoOpHighlighter(), true)

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(path.substring(dot).toLowerCase())
}

type BlobState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'success'
      readonly blob: BlobDto
      readonly lines: ReadonlyArray<string>
      readonly tokens: HighlightedLines | null
      readonly renderedMarkdown: string | null
    }
  | { readonly kind: 'image'; readonly rawUrl: string }
  | { readonly kind: 'binary'; readonly path: string }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'error'; readonly message: string }

type ViewMode = 'rendered' | 'source'

const state = ref<BlobState>({ kind: 'loading' })
const viewMode = ref<ViewMode>('rendered')
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

const isMarkdown = computed(() => {
  const name = fileName.value.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
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

    if (blob.binary) {
      // 画像ファイルは raw エンドポイント経由で表示
      if (isImagePath(path)) {
        const params = new URLSearchParams()
        params.set('path', path)
        params.set('rev', rev)
        state.value = { kind: 'image', rawUrl: `/api/blob/raw?${params.toString()}` }
        return
      }
      state.value = { kind: 'binary', path: blob.path }
      return
    }

    const lines = blob.content.split('\n')
    let tokens: HighlightedLines | null = null
    let renderedMarkdown: string | null = null

    if (blob.language !== null) {
      try {
        tokens = await highlighter.highlightFile(blob.content, blob.language)
      } catch {
        // トークン化失敗はプレーン fallback
      }
    }

    if (isUnmounted || gen !== generation) return

    // Markdown レンダリング
    const name = fileName.value.toLowerCase()
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
      try {
        renderedMarkdown = await renderMarkdown(blob.content, 'blob-mermaid')
      } catch {
        // レンダリング失敗はソース表示にフォールバック
      }
    }

    if (isUnmounted || gen !== generation) return

    state.value = { kind: 'success', blob, lines, tokens, renderedMarkdown }
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    state.value = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    }
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

function shikiTokenStyle(tok: HighlightedToken): Record<string, string> {
  return {
    '--shiki-l': tok.color ?? 'inherit',
    '--shiki-d': tok.colorDark ?? 'inherit',
  }
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

    <p v-if="state.kind === 'loading'" class="status">loading...</p>
    <p v-else-if="state.kind === 'not-found'" class="status error">
      ファイルが見つかりません
      <button class="back-link" @click="navigateToTree('')">ツリーに戻る</button>
    </p>
    <div v-else-if="state.kind === 'image'" class="image-view">
      <img :src="state.rawUrl" :alt="fileName" />
    </div>
    <p v-else-if="state.kind === 'binary'" class="status">
      バイナリファイルのため表示できません ({{ state.path }})
    </p>
    <p v-else-if="state.kind === 'error'" class="status error">error: {{ state.message }}</p>
    <template v-else-if="state.kind === 'success'">
      <div v-if="isMarkdown && state.renderedMarkdown !== null" class="blob-tabs">
        <button
          class="blob-tab"
          :class="{ active: viewMode === 'rendered' }"
          @click="viewMode = 'rendered'"
        >
          Rendered
        </button>
        <button
          class="blob-tab"
          :class="{ active: viewMode === 'source' }"
          @click="viewMode = 'source'"
        >
          Source
        </button>
      </div>

      <!--
        例外的に v-html を使用する。値は DOMPurify.sanitize() 通過済みであり、
        未サニタイズの文字列が渡されることはない (ADR 0028)。
        v-html の使用は本プロジェクトにおいて例外中の例外であり、
        DOMPurify 等による確実なサニタイズなしに使用してはならない。
      -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        v-if="isMarkdown && state.renderedMarkdown !== null && viewMode === 'rendered'"
        class="markdown-body"
        v-html="state.renderedMarkdown"
      ></div>
      <!-- eslint-enable vue/no-v-html -->

      <div v-else class="code-view">
        <div class="code-lines">
          <div v-for="(line, lineIdx) in state.lines" :key="lineIdx" class="code-row">
            <span class="row-lineno">{{ lineIdx + 1 }}</span>
            <span class="row-content">
              <template v-if="state.tokens !== null && state.tokens[lineIdx] !== undefined">
                <span
                  v-for="(tok, tokIdx) in state.tokens[lineIdx]"
                  :key="tokIdx"
                  class="shiki-tok"
                  :style="shikiTokenStyle(tok)"
                  >{{ tok.content }}</span
                >
              </template>
              <template v-else>{{ line }}</template>
            </span>
          </div>
        </div>
      </div>
    </template>
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
  margin-bottom: 0.75rem;
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
.status {
  color: var(--color-fg-muted);
}
.error {
  color: var(--color-error);
}
.back-link {
  background: none;
  border: none;
  color: var(--color-fg);
  cursor: pointer;
  text-decoration: underline;
  font-size: inherit;
  margin-left: 0.5rem;
}
.blob-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0;
}
.blob-tab {
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 0.9rem;
}
.blob-tab:hover {
  color: var(--color-fg);
}
.blob-tab.active {
  color: var(--color-fg);
  border-bottom-color: var(--color-fg);
}
.code-view {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
}
.code-lines {
  font-family: var(--font-mono);
}
.code-row {
  display: flex;
  line-height: 1.667;
}
.code-row:hover {
  background: var(--color-surface-hover);
}
.code-row .row-lineno {
  flex: 0 0 4em;
  text-align: right;
  padding-right: 0.75rem;
  color: var(--color-fg-faint);
  user-select: none;
}
.code-row .row-content {
  flex: 1;
  white-space: pre;
  padding-right: 1rem;
}
.image-view {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1rem;
  text-align: center;
  background: var(--color-surface-1);
}
.image-view img {
  max-width: 100%;
  height: auto;
}
</style>
