<script setup lang="ts">
/**
 * diff 表示コンポーネント (最小版)。
 *
 * 設計方針 (ADR 0012):
 * - マウント時に /api/diff/files を取得して左ペインにファイル一覧を表示
 * - ファイル選択で /api/diff/file?path=... を取得して右ペインにインライン diff を表示
 * - 構文ハイライト (Shiki) / word-diff / サイドバイサイド切替 / 折り畳みは後続タスク
 *
 * Race condition について (M5 対応):
 * - ユーザーがファイルを高速に切り替えた場合、後発の遅いレスポンスが
 *   先発の速いレスポンスを上書きする可能性がある (レース)
 * - 本版ではこれを「許容」する (AbortController 等は入れない)
 * - 必要になった時点で後続タスクで対応する
 */

import type { DiffFileDto, DiffFileSummaryDto } from '@git-web/common'
import { onMounted, ref } from 'vue'
import { fetchDiffFile, fetchDiffFiles } from '../api/diff.js'

const files = ref<ReadonlyArray<DiffFileSummaryDto>>([])
const selectedPath = ref<string | null>(null)
const selectedFile = ref<DiffFileDto | null>(null)
const loadingList = ref(false)
const loadingFile = ref(false)
const listError = ref<string | null>(null)
const fileError = ref<string | null>(null)
const fileNotFound = ref(false)

onMounted(async () => {
  loadingList.value = true
  try {
    const response = await fetchDiffFiles()
    files.value = response.files
  } catch (err) {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    loadingList.value = false
  }
})

async function selectFile(path: string): Promise<void> {
  selectedPath.value = path
  selectedFile.value = null
  fileNotFound.value = false
  fileError.value = null
  loadingFile.value = true
  try {
    const file = await fetchDiffFile(path)
    if (file === null) {
      fileNotFound.value = true
    } else {
      selectedFile.value = file
    }
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    loadingFile.value = false
  }
}

function statusInitial(status: DiffFileSummaryDto['status']): string {
  if (status === 'added') return 'A'
  if (status === 'deleted') return 'D'
  if (status === 'modified') return 'M'
  if (status === 'renamed') return 'R'
  return 'C'
}

function lineMarker(kind: 'context' | 'add' | 'delete'): string {
  if (kind === 'add') return '+'
  if (kind === 'delete') return '-'
  return ' '
}
</script>

<template>
  <div class="diff-view">
    <aside class="file-list">
      <h2>Files</h2>
      <p v-if="loadingList">loading...</p>
      <p v-else-if="listError !== null" class="error">error: {{ listError }}</p>
      <p v-else-if="files.length === 0">no changes</p>
      <ul v-else>
        <li
          v-for="file in files"
          :key="file.path"
          :class="{ selected: file.path === selectedPath }"
          @click="selectFile(file.path)"
        >
          <span class="status" :data-status="file.status">{{ statusInitial(file.status) }}</span>
          <span class="path">{{ file.path }}</span>
          <span class="stats">+{{ file.additions }}/-{{ file.deletions }}</span>
          <span v-if="file.binary" class="binary">binary</span>
        </li>
      </ul>
    </aside>
    <section class="file-detail">
      <p v-if="selectedPath === null">select a file</p>
      <p v-else-if="loadingFile">loading {{ selectedPath }}...</p>
      <p v-else-if="fileError !== null" class="error">error: {{ fileError }}</p>
      <p v-else-if="fileNotFound">no diff to display for {{ selectedPath }}</p>
      <template v-else-if="selectedFile !== null">
        <h2>{{ selectedFile.path }}</h2>
        <div v-for="(hunk, hunkIdx) in selectedFile.hunks" :key="hunkIdx" class="hunk">
          <div class="hunk-header">
            @@ -{{ hunk.oldStart }},{{ hunk.oldLines }} +{{ hunk.newStart }},{{ hunk.newLines }} @@
          </div>
          <div v-for="(line, lineIdx) in hunk.lines" :key="lineIdx" class="line" :class="line.kind">
            <span class="line-no">{{ line.oldLineNo ?? '' }}</span>
            <span class="line-no">{{ line.newLineNo ?? '' }}</span>
            <span class="marker">{{ lineMarker(line.kind) }}</span>
            <span class="content">{{ line.content }}</span>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  gap: 1rem;
  font-family: ui-monospace, monospace;
  margin-top: 1rem;
}
.file-list {
  width: 280px;
  border-right: 1px solid #ddd;
  padding-right: 1rem;
}
.file-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.file-list li {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-list li:hover {
  background: #f0f0f0;
}
.file-list li.selected {
  background: #e0e0ff;
}
.status {
  display: inline-block;
  width: 1.2em;
  text-align: center;
  font-weight: bold;
}
.status[data-status='added'] {
  color: #2a6;
}
.status[data-status='deleted'] {
  color: #c33;
}
.status[data-status='modified'] {
  color: #a60;
}
.path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats {
  font-size: 0.85em;
  color: #666;
}
.binary {
  font-size: 0.75em;
  color: #888;
}
.file-detail {
  flex: 1;
  min-width: 0;
}
.hunk {
  margin-bottom: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-x: auto;
}
.hunk-header {
  background: #f6f6f6;
  padding: 0.25rem 0.5rem;
  color: #666;
}
.line {
  display: flex;
  padding: 0 0.5rem;
  white-space: pre;
}
.line.add {
  background: #e6ffe6;
}
.line.delete {
  background: #ffe6e6;
}
.line-no {
  width: 3em;
  text-align: right;
  color: #999;
  padding-right: 0.5rem;
  user-select: none;
}
.marker {
  width: 1em;
  user-select: none;
}
.content {
  flex: 1;
  white-space: pre;
}
.error {
  color: #c00;
}
</style>
