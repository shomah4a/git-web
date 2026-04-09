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
import { type DiffRangeQuery, fetchDiffFile, fetchDiffFiles } from '../api/diff.js'
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
 *
 * バイト数は UTF-8 に encode した実バイト数で判定する (content.length の
 * UTF-16 コード単位とは別物で、日本語中心のファイルで判定が緩むのを避ける)。
 */
const MAX_BLOB_SIZE_BYTES = 512 * 1024
const MAX_BLOB_LINES = 5000
const blobSizeEncoder = new TextEncoder()

/**
 * Highlighter は main.ts から provide される。テスト / provide 無しの場合は
 * no-op にフォールバックする (ADR 0017)。
 *
 * `inject` の第 3 引数 `true` は default を factory として扱う指定で、
 * provide があった場合は factory 呼び出しをスキップし、無駄な no-op
 * インスタンス生成を避ける。
 */
const highlighter = inject(highlighterKey, () => createNoOpHighlighter(), true)

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
 * 現在の from/to state から DiffRangeQuery を組み立てる (ADR 0019)。
 *
 * 本ステップでは UI state 未導入のため、初期値として現行挙動と等価な
 * `{ from: 'HEAD' }` を返す。ADR 0018 の backend 側で working-vs-head と
 * working-vs-rev(HEAD) は CLI 引数 `['--end-of-options', 'HEAD']` に畳まれて
 * 同一扱いとなるため、この差し替えで diff の結果は変わらない。
 *
 * 次ステップ (fromRev/toRev state 追加) でこの関数が ref を読む形に差し替わる。
 */
function currentRange(): DiffRangeQuery {
  return { from: 'HEAD' }
}

/**
 * blob fetch 用の old/new rev を range から 1 度だけ決定する (ADR 0019)。
 *
 * - from=HEAD, to=(worktree) の初期状態では { old: 'HEAD', new: null } となり、
 *   改修前の挙動と完全一致する
 * - range を引き回すことで「fetch 開始時の range と blob 取得時の range が
 *   同一世代内でズレる」経路を構造的に排除する
 */
function resolveBlobRevs(range: DiffRangeQuery): { old: string | null; new: string | null } {
  return {
    old: range.from ?? null,
    new: range.to ?? null,
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
 *
 * ADR 0019: `rangeArg` を受け取れるようにし、呼び出し冒頭で range を 1 度だけ
 * 確定させる (range スナップショット)。引数省略時は現在の ref から組み立てる
 * `currentRange()` を呼ぶ。これで fetch 中に fromRev/toRev が書き換えられても
 * 単一世代内の整合が保たれる。
 */
async function runDiffLoad(rangeArg?: DiffRangeQuery): Promise<void> {
  const range = rangeArg ?? currentRange()
  const blobRevs = resolveBlobRevs(range)
  const myGen = ++generation
  loadingList.value = true
  try {
    const response = await fetchDiffFiles(range)
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
      response.files.map((summary) => fetchDiffFile(summary.path, range)),
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

    const newTokens = await loadAllTokens(successFiles, blobRevs)
    if (myGen !== generation) return
    applyTokenMap(newTokens)
  } catch (err) {
    if (myGen !== generation) return
    listError.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    // 後発 runDiffLoad が走っている場合、先発の finally で loadingList を
    // 書き戻すと後発が設定した true を上書きしてしまう (MEDIUM-1)。
    // 自分の世代が最新のときだけ false を設定する。
    if (myGen === generation) {
      loadingList.value = false
    }
  }
}

/**
 * 全ハイライト対象ファイルの両サイド blob を limiter 経由で取得し、
 * Shiki でトークン化する。すべて完了するまで待ってから Map を返す
 * (バッチ更新方式)。
 */
async function loadAllTokens(
  files: ReadonlyArray<{ summary: DiffFileSummaryDto; file: DiffFileDto }>,
  blobRevs: { old: string | null; new: string | null },
): Promise<Map<string, FileTokens>> {
  const result = new Map<string, FileTokens>()
  const tasks = files
    .filter(({ file }) => !file.binary && file.language !== null)
    .map(async ({ summary, file }) => {
      const needsOld = summary.status !== 'added'
      const needsNew = summary.status !== 'deleted'
      const [oldLines, newLines] = await Promise.all([
        needsOld ? fetchAndHighlight(file.path, blobRevs.old, 'old') : Promise.resolve(null),
        needsNew ? fetchAndHighlight(file.path, blobRevs.new, 'new') : Promise.resolve(null),
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
  if (blobSizeEncoder.encode(content).length > MAX_BLOB_SIZE_BYTES) return true
  // 行数は改行の数 + 1。regex の match 配列長で数える (for..of より高速)。
  const newlineCount = content.match(/\n/g)?.length ?? 0
  return newlineCount + 1 > MAX_BLOB_LINES
}

/**
 * tokenMap をバッチで差し替える。
 *
 * 防衛評価 M3 では max-content の幅変動で `.side-*` の scrollLeft が
 * clamp される懸念に対して保存 / 復元する案を検討したが、
 * 本実装では runDiffLoad が onMounted で 1 回だけ呼ばれる設計になっており、
 * 初回呼び出し時点で scrollLeft は 0 から始まるため clamp の影響を受けない。
 * 将来 rev 切り替え UI 等で runDiffLoad が再実行されるようになったら、
 * wheel / touch 起点の「ユーザー操作中」フラグを導入し、そのフラグが
 * 立っているときは復元をスキップする設計に拡張する (その時点での再 ADR)。
 */
function applyTokenMap(newTokens: Map<string, FileTokens>): void {
  tokenMap.value = newTokens
}

onMounted(() => {
  // runDiffLoad は内部で try/catch して listError に誘導するため通常ルートで
  // reject しない。それでも予期せぬ例外が漏れた場合のガードとして明示的な
  // catch を付け、unhandled rejection を Promise 上位に流さない。
  runDiffLoad().catch((err: unknown) => {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  })
})

// テスト側から同一インスタンス内で runDiffLoad を再実行できるようにして、
// generation race を直接検証する (ADR 0017 / 防衛評価 MEDIUM-5 対応)。
// 本番では外部から呼ぶ経路は無く、rev 切り替え UI 等の将来拡張で利用予定。
defineExpose({ runDiffLoad })

// entries 差し替え時にのみ scroll sync を再 setup する。tokenMap の更新は
// entries を触らないので本 watch は発火しない。これは ADR 0017 の判断通り
// で、tokenMap 差し替え時に v-for key=path で .side-* の DOM identity が
// 維持されるため、scroll sync ハンドラは再 attach 不要 (リーク経路なし)。
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
 * hunk の行ペアリング結果に両サイドのトークン列を付与する。
 *
 * 目的:
 * - `pairLines` の結果に、tokenMap から引いたトークン列を行単位で付ける
 * - template 側で v-if の条件と v-for の iterable で同じ `tokensFor` を
 *   2 回呼ぶ冗長を避け、1 行あたりの reactive 評価を削減する
 * - `pairLines(hunk.lines)` 自体も左右 template で 2 回呼ばれていたのを
 *   1 回に統合する
 *
 * tokenMap の参照が入っているため、tokenMap が差し替わったときに自動で
 * 再評価される (Vue のテンプレート内関数呼び出しは reactive dep を追跡する)。
 */
type EnrichedRow = {
  readonly left: DiffFileDto['hunks'][number]['lines'][number] | null
  readonly right: DiffFileDto['hunks'][number]['lines'][number] | null
  readonly leftTokens: ReadonlyArray<HighlightedToken> | null
  readonly rightTokens: ReadonlyArray<HighlightedToken> | null
}

function enrichHunk(path: string, hunk: DiffFileDto['hunks'][number]): ReadonlyArray<EnrichedRow> {
  const fileTokens = tokenMap.value.get(path)
  const oldLines = fileTokens?.old ?? null
  const newLines = fileTokens?.new ?? null
  return pairLines(hunk.lines).map((row) => ({
    left: row.left,
    right: row.right,
    leftTokens:
      row.left?.oldLineNo != null && oldLines !== null
        ? (oldLines[row.left.oldLineNo - 1] ?? null)
        : null,
    rightTokens:
      row.right?.newLineNo != null && newLines !== null
        ? (newLines[row.right.newLineNo - 1] ?? null)
        : null,
  }))
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
                        v-for="(row, rowIdx) in enrichHunk(entry.summary.path, hunk)"
                        :key="rowIdx"
                        class="row"
                        :class="cellClass(row.left)"
                      >
                        <span class="row-lineno">{{ row.left?.oldLineNo ?? '' }}</span>
                        <span class="row-content">
                          <template v-if="row.leftTokens !== null">
                            <span
                              v-for="(tok, tokIdx) in row.leftTokens"
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
                        v-for="(row, rowIdx) in enrichHunk(entry.summary.path, hunk)"
                        :key="rowIdx"
                        class="row"
                        :class="cellClass(row.right)"
                      >
                        <span class="row-lineno">{{ row.right?.newLineNo ?? '' }}</span>
                        <span class="row-content">
                          <template v-if="row.rightTokens !== null">
                            <span
                              v-for="(tok, tokIdx) in row.rightTokens"
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
