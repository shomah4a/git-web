<script setup lang="ts">
/**
 * diff 表示コンポーネント。
 *
 * 設計方針 (ADR 0012 + ADR 0014 + ADR 0015):
 * - マウント時に /api/diff/files でファイル一覧を取得
 * - 続けて全ファイルの /api/diff/file?path=... を Promise.allSettled で並列取得
 * - 左ペインにファイル一覧 (ナビゲーション)
 * - 右ペインに全ファイルの diff を縦積み (Split View: 左=旧 / 右=新)
 * - ファイル一覧クリックで該当セクションへ scrollIntoView
 * - 各ファイルはヘッダークリックで折りたたみ可能、デフォルトは展開
 * - 個別ファイルの fetch 失敗はそのカードのみエラー表示、他は継続
 */

import type { DiffFileDto, DiffFileSummaryDto } from '@git-web/common'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchDiffFile, fetchDiffFiles } from '../api/diff.js'
import { pairLines } from '../diff/pair-lines.js'

type DiffLineDto = DiffFileDto['hunks'][number]['lines'][number]

type FileState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly file: DiffFileDto }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error'; readonly message: string }

type FileEntry = {
  readonly summary: DiffFileSummaryDto
  state: FileState
  collapsed: boolean
}

const entries = ref<FileEntry[]>([])
const loadingList = ref(false)
const listError = ref<string | null>(null)
const diffRoot = ref<HTMLElement | null>(null)

/**
 * 左右スクロール同期 (Task C, ADR 0015 補遺)。
 *
 * Split View は `.hunk-content` 内の `.side-left` / `.side-right` がそれぞれ
 * `overflow-x: scroll` で横スクロールする。長い行を読むときに左右別々に
 * スクロールすると対応が取れないため、`scrollLeft` を hunk 単位で相互に
 * コピーする。
 *
 * - hunk ごとに閉じた `isSyncing` フラグで無限ループ (scroll → scrollLeft 代入
 *   → scroll イベント → ...) を防ぐ
 * - `entries` が差し替わるたびに DOM が作り直されるので、teardown → 再 setup
 *   する。`watch` は `flush: 'post'` + `nextTick` で DOM 反映後に走る
 * - unmount 時はリスナーを全解除
 */
const scrollSyncCleanups: Array<() => void> = []

function teardownScrollSync(): void {
  for (const cleanup of scrollSyncCleanups) {
    cleanup()
  }
  scrollSyncCleanups.length = 0
}

function setupScrollSync(): void {
  teardownScrollSync()
  const root = diffRoot.value
  if (root === null) {
    return
  }
  const hunks = root.querySelectorAll<HTMLElement>('.hunk-content')
  for (const hunk of Array.from(hunks)) {
    const left = hunk.querySelector<HTMLElement>('.side-left')
    const right = hunk.querySelector<HTMLElement>('.side-right')
    if (left === null || right === null) {
      continue
    }
    let isSyncing = false
    const makeHandler = (src: HTMLElement, dst: HTMLElement): (() => void) => {
      return () => {
        if (isSyncing) {
          return
        }
        isSyncing = true
        dst.scrollLeft = src.scrollLeft
        isSyncing = false
      }
    }
    const onLeftScroll = makeHandler(left, right)
    const onRightScroll = makeHandler(right, left)
    left.addEventListener('scroll', onLeftScroll, { passive: true })
    right.addEventListener('scroll', onRightScroll, { passive: true })
    scrollSyncCleanups.push(() => {
      left.removeEventListener('scroll', onLeftScroll)
      right.removeEventListener('scroll', onRightScroll)
    })
  }
}

onMounted(async () => {
  loadingList.value = true
  try {
    const response = await fetchDiffFiles()
    entries.value = response.files.map(
      (summary): FileEntry => ({
        summary,
        state: { kind: 'loading' },
        collapsed: false,
      }),
    )

    const results = await Promise.allSettled(
      response.files.map((summary) => fetchDiffFile(summary.path)),
    )

    entries.value = response.files.map((summary, idx) => {
      const result = results[idx]
      const state = resolveState(result)
      return { summary, state, collapsed: false }
    })
  } catch (err) {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    loadingList.value = false
  }
})

watch(
  entries,
  async () => {
    await nextTick()
    setupScrollSync()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  teardownScrollSync()
})

function resolveState(result: PromiseSettledResult<DiffFileDto | null> | undefined): FileState {
  if (result === undefined) {
    return { kind: 'loading' }
  }
  if (result.status === 'rejected') {
    const message = result.reason instanceof Error ? result.reason.message : 'unknown error'
    return { kind: 'error', message }
  }
  if (result.value === null) {
    return { kind: 'notFound' }
  }
  return { kind: 'success', file: result.value }
}

function anchorId(path: string): string {
  return `diff-file-${encodeURIComponent(path)}`
}

function scrollToFile(path: string): void {
  const el = document.getElementById(anchorId(path))
  if (el !== null) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function toggleCollapsed(entry: FileEntry): void {
  entry.collapsed = !entry.collapsed
}

function statusInitial(status: DiffFileSummaryDto['status']): string {
  if (status === 'added') return 'A'
  if (status === 'deleted') return 'D'
  if (status === 'modified') return 'M'
  if (status === 'renamed') return 'R'
  return 'C'
}

function cellClass(line: DiffLineDto | null): string {
  if (line === null) return 'cell-empty'
  if (line.kind === 'delete') return 'cell-delete'
  if (line.kind === 'add') return 'cell-add'
  return 'cell-context'
}

function successFile(state: FileState): DiffFileDto | null {
  return state.kind === 'success' ? state.file : null
}
</script>

<template>
  <div ref="diffRoot" class="diff-view">
    <aside class="file-list">
      <h2>Files</h2>
      <p v-if="loadingList">loading...</p>
      <p v-else-if="listError !== null" class="error">error: {{ listError }}</p>
      <p v-else-if="entries.length === 0">no changes</p>
      <ul v-else>
        <li
          v-for="entry in entries"
          :key="entry.summary.path"
          @click="scrollToFile(entry.summary.path)"
        >
          <span class="status" :data-status="entry.summary.status">{{
            statusInitial(entry.summary.status)
          }}</span>
          <span class="path">{{ entry.summary.path }}</span>
          <span class="stats">+{{ entry.summary.additions }}/-{{ entry.summary.deletions }}</span>
          <span v-if="entry.summary.binary" class="binary">binary</span>
        </li>
      </ul>
    </aside>
    <section class="file-detail">
      <p v-if="loadingList">loading...</p>
      <p v-else-if="listError !== null" class="error">error: {{ listError }}</p>
      <p v-else-if="entries.length === 0">no changes</p>
      <template v-else>
        <article
          v-for="entry in entries"
          :id="anchorId(entry.summary.path)"
          :key="entry.summary.path"
          class="file-card"
        >
          <header class="file-header" @click="toggleCollapsed(entry)">
            <button
              type="button"
              class="toggle"
              :aria-expanded="!entry.collapsed"
              :aria-label="entry.collapsed ? 'expand' : 'collapse'"
            >
              {{ entry.collapsed ? '▸' : '▾' }}
            </button>
            <span class="status" :data-status="entry.summary.status">{{
              statusInitial(entry.summary.status)
            }}</span>
            <span class="path">{{ entry.summary.path }}</span>
            <span class="stats">+{{ entry.summary.additions }}/-{{ entry.summary.deletions }}</span>
          </header>
          <div v-show="!entry.collapsed" class="file-body">
            <p v-if="entry.state.kind === 'loading'">loading {{ entry.summary.path }}...</p>
            <p v-else-if="entry.state.kind === 'notFound'">
              no diff to display for {{ entry.summary.path }}
            </p>
            <p v-else-if="entry.state.kind === 'error'" class="error">
              error: {{ entry.state.message }}
            </p>
            <template v-else-if="successFile(entry.state) !== null">
              <div
                v-for="(hunk, hunkIdx) in successFile(entry.state)?.hunks ?? []"
                :key="hunkIdx"
                class="hunk"
              >
                <div class="hunk-header">
                  @@ -{{ hunk.oldStart }},{{ hunk.oldLines }} +{{ hunk.newStart }},{{
                    hunk.newLines
                  }}
                  @@
                </div>
                <div class="hunk-content">
                  <div class="side side-left">
                    <div class="side-inner">
                      <div
                        v-for="(row, rowIdx) in pairLines(hunk.lines)"
                        :key="rowIdx"
                        class="row"
                        :class="cellClass(row.left)"
                      >
                        <span class="row-lineno">{{ row.left?.oldLineNo ?? '' }}</span>
                        <span class="row-content">{{ row.left?.content ?? '' }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="side side-right">
                    <div class="side-inner">
                      <div
                        v-for="(row, rowIdx) in pairLines(hunk.lines)"
                        :key="rowIdx"
                        class="row"
                        :class="cellClass(row.right)"
                      >
                        <span class="row-lineno">{{ row.right?.newLineNo ?? '' }}</span>
                        <span class="row-content">{{ row.right?.content ?? '' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </article>
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
  align-items: flex-start;
}
.file-list {
  width: 280px;
  border-right: 1px solid #ddd;
  padding-right: 1rem;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
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
.file-card {
  margin-bottom: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}
.file-header {
  background: #f6f6f6;
  padding: 0.4rem 0.6rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #ddd;
}
.file-header:hover {
  background: #eee;
}
.toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 1em;
  line-height: 1;
  width: 1.2em;
  color: #666;
}
.file-body {
  font-size: 0.9em;
}
.hunk {
  border-top: 1px solid #eee;
}
.hunk:first-child {
  border-top: none;
}
.hunk-header {
  background: #f0f0f6;
  padding: 0.2rem 0.5rem;
  color: #666;
}
.hunk-content {
  display: flex;
  align-items: flex-start;
}
.side {
  flex: 1 1 50%;
  min-width: 0;
  /*
   * 片方だけ overflow-x: auto にするとスクロールバー高分の差で行の縦位置が
   * 左右でズレる。常にスクロールバー領域を確保するため scroll を使う。
   */
  overflow-x: scroll;
}
.side-left {
  border-right: 1px solid #ddd;
}
/*
 * 横スクロール時に背景色 (cell-*) が viewport 幅で途切れる問題への対策。
 * .side-inner が「全 row のうち最長行」の幅を持ち、各 .row は width: 100% で
 * その最長幅に追随する。これにより content が空の行 (cell-empty など) でも
 * スクロール領域の端まで背景色が伸びる。
 * - width: max-content で子の最大幅まで伸びる
 * - min-width: 100% で短いケースでも viewport 幅を埋める
 */
.side-inner {
  width: max-content;
  min-width: 100%;
}
/*
 * .row は flex ではなく block + inline-block で組む。
 * flex (特に flex: _ _ auto + white-space: pre) では max-content 計算が
 * pre テキストの自然幅を正しく反映しないケースがあり、.row の offsetWidth が
 * 実際の content 幅より小さくなって背景色が content の右端まで届かなかった
 * (実測: .row.offsetWidth 590 / .row.scrollWidth 619)。
 * block + inline-block なら親の max-content は「子 inline-block 幅の合計」に
 * 素直になる。
 */
.row {
  display: block;
  line-height: 1.4;
  /*
   * 空セルでも 1 行分の高さを確保する。これがないと cell-empty の行が
   * 子要素のテキスト高 0 で collapse し、左右で高さが揃わなくなる。
   */
  min-height: 1.4em;
  /*
   * width: max-content で .row 自身を content 幅まで伸ばし、
   * min-width: 100% で短い行を .side-inner の最長行幅までストレッチする。
   */
  width: max-content;
  min-width: 100%;
  /* 子 inline-block 間で改行を入れない (テンプレートの空白対策も兼ねる) */
  white-space: nowrap;
}
.row-lineno {
  display: inline-block;
  width: 3em;
  padding: 0 0.5em;
  text-align: right;
  color: #999;
  user-select: none;
  vertical-align: top;
}
.row-content {
  display: inline-block;
  padding: 0 0.5em;
  /* pre: テキスト自体は折り返さず空白もそのまま保持する */
  white-space: pre;
  vertical-align: top;
}
.cell-delete {
  background: #ffe6e6;
}
.cell-add {
  background: #e6ffe6;
}
.cell-empty {
  background: #f5f5f5;
}
.cell-context {
  background: transparent;
}
.error {
  color: #c00;
  padding: 0.5rem;
}
</style>
