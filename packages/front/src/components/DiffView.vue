<script setup lang="ts">
/**
 * diff 表示コンポーネント。
 *
 * 設計方針 (ADR 0012 + ADR 0014 + ADR 0015 + ADR 0017):
 * - マウント時に /api/diff/files でファイル一覧を取得
 * - 続けて全ファイルの /api/diff/file?path=... を Promise.allSettled で並列取得
 * - さらに各ファイルの両サイド (old = HEAD, new = worktree) の blob を
 *   同時実行数 6 の limiter 経由で取得し、Shiki でファイル全文を
 *   トークン化する
 * - 非同期処理は `runDiffLoad` 単一関数に集約し、世代カウンタで race を
 *   後発優先に統一する。tokenMap はバッチ更新 (全ファイル完了後に 1 回だけ差し替え)
 * - 左ペインにファイル一覧 (ナビゲーション)
 * - 右ペインに全ファイルの diff を縦積み (Split View: 左=旧 / 右=新)
 * - ファイル一覧クリックで該当セクションへ scrollIntoView
 * - 各ファイルはヘッダークリックで折りたたみ可能、デフォルトは展開
 * - 個別ファイルの fetch 失敗はそのカードのみエラー表示、他は継続
 * - blob 取得 / ハイライト失敗は該当ファイルだけプレーン fallback
 */

import type { DiffFileDto, DiffFileSummaryDto } from '@git-web/common'
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchBlob } from '../api/blob.js'
import { fetchDiffFile, fetchDiffFiles } from '../api/diff.js'
import { createLimiter } from '../diff/highlighter/limit.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import {
  type HighlightedLines,
  type HighlightedToken,
  highlighterKey,
} from '../diff/highlighter/types.js'
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

/**
 * ファイルごとの両サイドのトークン列 (ADR 0017)。
 * - `null` = そのサイドはプレーン fallback (blob 未取得 / 失敗 / 言語不明 / 大容量)
 * - 両サイドとも null のファイルは tokenMap に entry を入れない
 */
type FileTokens = {
  readonly old: HighlightedLines | null
  readonly new: HighlightedLines | null
}

const entries = ref<FileEntry[]>([])
const loadingList = ref(false)
const listError = ref<string | null>(null)
const diffRoot = ref<HTMLElement | null>(null)
const tokenMap = ref<Map<string, FileTokens>>(new Map())

/**
 * runDiffLoad の世代カウンタ (ADR 0017)。
 *
 * 非同期処理の entrypoint を runDiffLoad 単一関数に集約し、差し替え時に
 * インクリメントする。非同期の途中 / 完了時点で generation が進んでいたら
 * 結果を破棄 (後発優先、ADR 0015 と整合)。
 */
let generation = 0

/**
 * blob fetch の同時実行数 limiter (ADR 0017 / 防衛評価 M1)。
 * diff file 取得 (ADR 0014 の N 並列) に加えて最大 2N の blob fetch が
 * 発生するため、dev server の connection 詰まりを避けるべく 6 並列に絞る。
 */
const blobLimit = createLimiter(6)

/**
 * 大容量ファイルの silent fallback 閾値 (ADR 0017 / 防衛評価 M5)。
 * Shiki wasm に巨大ファイルを流すと UI がフリーズするため、どちらかを
 * 超えたファイルはプレーン表示にフォールバック。
 */
const MAX_BLOB_SIZE_BYTES = 512 * 1024
const MAX_BLOB_LINES = 5000

/**
 * Highlighter は main.ts から provide される。テスト / provide 無しの場合は
 * no-op にフォールバックする (ADR 0017)。
 */
const highlighter = inject(highlighterKey, createNoOpHighlighter())

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

/**
 * 非同期処理の単一 entrypoint。
 *
 * - 呼び出しごとに generation++ して myGen に保存
 * - fetch → entries 更新 → diff file 並列取得 → 全ファイルの blob/highlight
 *   → tokenMap バッチ反映 の順で実行
 * - 途中で generation が進んだら結果を破棄 (後発優先)
 * - 例外は listError に載せる (既存挙動との互換)
 */
async function runDiffLoad(): Promise<void> {
  const myGen = ++generation
  loadingList.value = true
  try {
    const response = await fetchDiffFiles()
    if (myGen !== generation) return

    entries.value = response.files.map(
      (summary): FileEntry => ({
        summary,
        state: { kind: 'loading' },
        collapsed: false,
      }),
    )
    tokenMap.value = new Map()

    const diffResults = await Promise.allSettled(
      response.files.map((summary) => fetchDiffFile(summary.path)),
    )
    if (myGen !== generation) return

    entries.value = response.files.map((summary, idx) => {
      const result = diffResults[idx]
      const state = resolveState(result)
      return { summary, state, collapsed: false }
    })
    // 先に loading 表示を切り上げて template に .hunk-content を描画させる。
    // これを先にやっておかないと、loadAllTokens の await 中に watch(entries)
    // の post flush callback が走った時点で template はまだ <p>loading...</p>
    // を描画しており、setupScrollSync が空振りする。
    loadingList.value = false

    // トークン化対象は diff file が success のもののみ
    const successFiles: Array<{ summary: DiffFileSummaryDto; file: DiffFileDto }> = []
    response.files.forEach((summary, idx) => {
      const r = diffResults[idx]
      if (r !== undefined && r.status === 'fulfilled' && r.value !== null) {
        successFiles.push({ summary, file: r.value })
      }
    })

    const newTokens = await loadAllTokens(successFiles)
    if (myGen !== generation) return
    applyTokenMapWithScrollPreserve(newTokens)
  } catch (err) {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    loadingList.value = false
  }
}

/**
 * 全ハイライト対象ファイルの両サイド blob を limiter 経由で取得し、
 * Shiki でトークン化する。すべて完了するまで待ってから Map を返す
 * (バッチ更新方式)。
 */
async function loadAllTokens(
  files: ReadonlyArray<{ summary: DiffFileSummaryDto; file: DiffFileDto }>,
): Promise<Map<string, FileTokens>> {
  const result = new Map<string, FileTokens>()
  const tasks = files
    .filter(({ file }) => !file.binary && file.language !== null)
    .map(async ({ summary, file }) => {
      const needsOld = summary.status !== 'added'
      const needsNew = summary.status !== 'deleted'
      const [oldLines, newLines] = await Promise.all([
        needsOld ? fetchAndHighlight(file.path, 'HEAD', 'old') : Promise.resolve(null),
        needsNew ? fetchAndHighlight(file.path, null, 'new') : Promise.resolve(null),
      ])
      if (oldLines !== null || newLines !== null) {
        result.set(summary.path, { old: oldLines, new: newLines })
      }
    })
  await Promise.all(tasks)
  return result
}

/**
 * 単一サイドの blob 取得 → 大容量閾値チェック → highlightFile の一連処理。
 * いかなる失敗も null に倒し、該当サイドだけプレーン fallback に落とす。
 */
async function fetchAndHighlight(
  path: string,
  rev: string | null,
  side: 'old' | 'new',
): Promise<HighlightedLines | null> {
  try {
    const blob = await blobLimit(() => fetchBlob(path, rev))
    if (blob === null) return null
    if (blob.binary || blob.language === null) return null
    if (isTooLarge(blob.content)) {
      console.warn(`[highlighter] ${path} (${side}) exceeds size threshold, fallback to plain`)
      return null
    }
    return await highlighter.highlightFile(blob.content, blob.language)
  } catch (err) {
    console.warn(`[highlighter] fetchAndHighlight failed for ${path} (${side})`, err)
    return null
  }
}

function isTooLarge(content: string): boolean {
  if (content.length > MAX_BLOB_SIZE_BYTES) return true
  let newlines = 0
  for (const ch of content) {
    if (ch === '\n') newlines += 1
  }
  return newlines + 1 > MAX_BLOB_LINES
}

/**
 * tokenMap の差し替え前後で、表示中のスクロール位置を保存・復元する
 * (ADR 0017 / 防衛評価 M3)。
 *
 * `.side-inner` の `width: max-content` はトークン span の再計算で
 * わずかに幅が変わる可能性があり、ブラウザが scrollLeft を clamp し直して
 * 意図せず左に戻るケースを避ける。
 */
function applyTokenMapWithScrollPreserve(newTokens: Map<string, FileTokens>): void {
  const root = diffRoot.value
  if (root === null) {
    tokenMap.value = newTokens
    return
  }
  const sides = Array.from(root.querySelectorAll<HTMLElement>('.side-left, .side-right'))
  const savedLeft = new Map<HTMLElement, number>()
  const savedTop = new Map<HTMLElement, number>()
  for (const side of sides) {
    savedLeft.set(side, side.scrollLeft)
    savedTop.set(side, side.scrollTop)
  }
  tokenMap.value = newTokens

  void nextTick().then(() => {
    // 本実装では各行の高さは変わらないので window.scrollY は復元しない
    // (jsdom の window.scrollTo 未実装警告も回避)。max-content の幅が
    // 変動するケースのみ各 side の scrollLeft / scrollTop を書き戻す。
    for (const [el, left] of savedLeft) {
      el.scrollLeft = left
    }
    for (const [el, top] of savedTop) {
      el.scrollTop = top
    }
  })
}

onMounted(() => {
  void runDiffLoad()
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

/**
 * 指定行のトークン列を tokenMap から引く。見つからなければ null (プレーン fallback)。
 *
 * - `lineNo === null` (空セル、pairLines で左右対応する側が無い行) は null
 * - ファイルが tokenMap にない (未トークン化 / 対象外) も null
 * - 該当サイドが null (未取得 / 失敗) も null
 * - 行 index が範囲外 (Shiki の末尾空行を超えるなど) も null
 */
function tokensFor(
  path: string,
  side: 'old' | 'new',
  lineNo: number | null,
): ReadonlyArray<HighlightedToken> | null {
  if (lineNo === null) return null
  const fileTokens = tokenMap.value.get(path)
  if (fileTokens === undefined) return null
  const sideTokens = side === 'old' ? fileTokens.old : fileTokens.new
  if (sideTokens === null) return null
  return sideTokens[lineNo - 1] ?? null
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
                        <span class="row-content">
                          <template
                            v-if="
                              tokensFor(entry.summary.path, 'old', row.left?.oldLineNo ?? null) !==
                              null
                            "
                          >
                            <span
                              v-for="(tok, tokIdx) in tokensFor(
                                entry.summary.path,
                                'old',
                                row.left?.oldLineNo ?? null,
                              ) ?? []"
                              :key="tokIdx"
                              :style="tok.color !== null ? { color: tok.color } : undefined"
                              >{{ tok.content }}</span
                            >
                          </template>
                          <template v-else>{{ row.left?.content ?? '' }}</template>
                        </span>
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
                        <span class="row-content">
                          <template
                            v-if="
                              tokensFor(entry.summary.path, 'new', row.right?.newLineNo ?? null) !==
                              null
                            "
                          >
                            <span
                              v-for="(tok, tokIdx) in tokensFor(
                                entry.summary.path,
                                'new',
                                row.right?.newLineNo ?? null,
                              ) ?? []"
                              :key="tokIdx"
                              :style="tok.color !== null ? { color: tok.color } : undefined"
                              >{{ tok.content }}</span
                            >
                          </template>
                          <template v-else>{{ row.right?.content ?? '' }}</template>
                        </span>
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
