<script setup lang="ts">
/**
 * blob 表示の共有コンポーネント (ADR 0038)。
 *
 * BlobView (revision 用) と WorktreeBlobView (worktree 用) の両方から使用される。
 * blob データの取得は呼び出し側が行い、このコンポーネントは表示に専念する。
 */

import { computed, ref } from 'vue'
import type { HighlightedToken } from '../diff/highlighter/types.js'
import type { BlobContentState } from './blob-content-state.js'

type ViewMode = 'rendered' | 'source'

const props = defineProps<{
  state: BlobContentState
  fileName: string
  chromeless?: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate-back'): void
}>()

const viewMode = ref<ViewMode>('rendered')

const isMarkdown = computed(() => {
  const name = props.fileName.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
})

function shikiTokenStyle(tok: HighlightedToken): Record<string, string> {
  return {
    '--shiki-l': tok.color ?? 'inherit',
    '--shiki-d': tok.colorDark ?? 'inherit',
  }
}
</script>

<template>
  <div class="blob-content">
    <p v-if="state.kind === 'loading'" class="status">loading...</p>
    <p v-else-if="state.kind === 'not-found'" class="status error">
      ファイルが見つかりません
      <button class="back-link" @click="emit('navigate-back')">ツリーに戻る</button>
    </p>
    <div v-else-if="state.kind === 'image'" class="image-view">
      <img :src="state.rawUrl" :alt="fileName" />
    </div>
    <p v-else-if="state.kind === 'binary'" class="status">
      バイナリファイルのため表示できません ({{ state.path }})
    </p>
    <p v-else-if="state.kind === 'error'" class="status error">error: {{ state.message }}</p>
    <template v-else-if="state.kind === 'success'">
      <div
        v-if="isMarkdown && state.renderedMarkdown !== null && !props.chromeless"
        class="blob-tabs"
      >
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
        v-if="
          isMarkdown &&
          state.renderedMarkdown !== null &&
          (props.chromeless || viewMode === 'rendered')
        "
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
