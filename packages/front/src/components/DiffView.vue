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

import type { DiffFileDto, DiffFileSummaryDto, RefListDto } from '@git-web/common'
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBlob } from '../api/blob.js'
import { type DiffRangeQuery, fetchDiffFile, fetchDiffFiles } from '../api/diff.js'
import { fetchRefs } from '../api/refs.js'
import {
  type DiffRangeUrlState,
  DEFAULT_FROM,
  DEFAULT_TO,
  WORKTREE_SENTINEL,
} from '../url-state.js'
import { createLimiter } from '../diff/highlighter/limit.js'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import {
  type HighlightedLines,
  type HighlightedToken,
  highlighterKey,
} from '../diff/highlighter/types.js'
import { pairLines } from '../diff/pair-lines.js'
import RevisionCombobox from './RevisionCombobox.vue'

type DiffLineDto = DiffFileDto['hunks'][number]['lines'][number]

type FileState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly file: DiffFileDto }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error'; readonly message: string }

type ActiveTab = 'diff' | 'code'

type CodeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'success'
      readonly lines: ReadonlyArray<string>
      readonly tokens: HighlightedLines | null
    }
  | { readonly kind: 'error'; readonly message: string }

type FileEntry = {
  readonly summary: DiffFileSummaryDto
  state: FileState
  collapsed: boolean
  activeTab: ActiveTab
  codeState: CodeState
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

// UI 上の仮想 ref 文字列 (ADR 0019 / 0020)。`to === WORKTREE_SENTINEL` で
// 「作業ツリー」を表し、API クエリ上は `to` キーを送らない形にマッピングする。
// from 側には worktree 項目を出さないため、from がこの値になることは通常起きない。
// MEDIUM-1 対応で `url-state.ts` を単一の真実として import 共有する。

const entries = ref<FileEntry[]>([])
const loadingList = ref(false)
const listError = ref<string | null>(null)
const diffRoot = ref<HTMLElement | null>(null)
const tokenMap = ref<Map<string, FileTokens>>(new Map())

/**
 * unmount 済みフラグ (ADR 0019 LOW-2)。
 *
 * onMounted で並列発火する fetchRefs が遅れて解決したとき、本コンポーネントが
 * すでに unmount されていれば `initialRefs.value = result` の副作用をスキップ
 * する。Vue 3 では unmounted ref への代入自体は警告にならないが、combobox
 * 世代カウンタ / runDiffLoad generation カウンタと同じ防御パターンに揃える
 * ことで、将来 mount/unmount を繰り返すテストや SSR hydration 周辺で思わぬ
 * 副作用が混入するのを防ぐ。
 */
let isUnmounted = false

/**
 * from/to セレクタの現在値 (ADR 0019 / 0020)。
 *
 * 初期値は URL の query から復元する。query が空の場合は
 * `from = 'HEAD'`, `to = '(worktree)'` (ADR 0019 の既定) と等価。
 * url-state モジュールの WORKTREE_SENTINEL と本ファイルの WORKTREE_SENTINEL が
 * 同値であることが前提で、この不変量は url-state.test.ts と本ファイル側の
 * 定数宣言で二重化して担保する。
 */
const route = useRoute()
const router = useRouter()

function readRangeFromRoute(): DiffRangeUrlState {
  const from =
    typeof route.query.from === 'string' && route.query.from !== ''
      ? route.query.from
      : DEFAULT_FROM
  const to =
    typeof route.query.to === 'string' && route.query.to !== '' ? route.query.to : DEFAULT_TO
  return { from, to }
}

const initialRange = readRangeFromRoute()
const fromRev = ref<string>(initialRange.from)
const toRev = ref<string>(initialRange.to)

/**
 * RevisionCombobox に渡す初期候補 (ADR 0019)。
 * onMounted で runDiffLoad と並列に `fetchRefs('')` を発火し、結果を
 * ここへ入れる。取得失敗時は null のままで、combobox は自由入力のみ可となる。
 */
const initialRefs = ref<RefListDto | null>(null)

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
 * - `to === WORKTREE_SENTINEL` のとき、API クエリの `to` は undefined にして
 *   URL に載せない (backend は working-vs-rev(from) 側に分岐する)
 * - from が `WORKTREE_SENTINEL` になるのは UI 上起きない想定だが、防御的に
 *   undefined に倒す
 */
function currentRange(): DiffRangeQuery {
  const result: { from?: string; to?: string } = {}
  if (fromRev.value !== WORKTREE_SENTINEL) {
    result.from = fromRev.value
  }
  if (toRev.value !== WORKTREE_SENTINEL) {
    result.to = toRev.value
  }
  return result
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
        activeTab: 'diff',
        codeState: { kind: 'idle' },
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
      return { summary, state, collapsed: false, activeTab: 'diff', codeState: { kind: 'idle' } }
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
  // 並列で refs 一覧を先読みしておく (ADR 0019)。失敗しても runDiffLoad には
  // 影響させず、combobox が自由入力のみになる形にフォールバックする。
  fetchRefs('')
    .then((result) => {
      if (isUnmounted) return
      initialRefs.value = result
    })
    .catch((err: unknown) => {
      if (isUnmounted) return
      console.warn('[DiffView] initial fetchRefs failed', err)
    })
  // ADR 0020 / ADR 0022: route.query の watch で back/forward に対応する。
})

// テスト側から同一インスタンス内で runDiffLoad を再実行できるようにして、
// generation race を直接検証する (ADR 0017 / 防衛評価 MEDIUM-5 対応)。
// ADR 0019 では適用ボタンの click ハンドラ経由で同じエントリポイントを使う。
defineExpose({ runDiffLoad })

/**
 * 現在の from/to を URL へ反映する (ADR 0020 / ADR 0022)。
 *
 * Vue Router の push を使い、from/to がデフォルト値のときはキーを省略する。
 */
function syncUrlFromState(): void {
  const range: DiffRangeUrlState = { from: fromRev.value, to: toRev.value }
  const query: Record<string, string> = {}
  if (range.from !== DEFAULT_FROM) {
    query.from = range.from
  }
  if (range.to !== DEFAULT_TO) {
    query.to = range.to
  }
  void router.push({ query })
}

/**
 * 適用ボタンハンドラ (ADR 0019 / 0020)。
 *
 * 現在の from/to state を明示的にスナップショットして runDiffLoad に渡す。
 * loadingList 中は template 側で disabled にしているが、防御的に確認する。
 * URL は runDiffLoad 発火と同時に更新する (pushState は同一 range なら no-op)。
 */
function onApply(): void {
  if (loadingList.value) return
  syncUrlFromState()
  runDiffLoad(currentRange()).catch((err: unknown) => {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  })
}

/**
 * RevisionCombobox の `submit` イベントを受けて自動適用する (ADR 0019)。
 *
 * Vue の v-model emit は onRevSubmit より前に走るため、`fromRev`/`toRev` は
 * すでに最新値に更新されている。currentRange() がその最新値を拾う。
 *
 * loadingList 中でも呼ぶ: runDiffLoad の generation カウンタが race を吸収
 * するため、前発の処理は自動的に破棄される。適用ボタンの disabled は UI
 * 明示操作に対する二重押下防止であり、ここには適用しない。
 */
function onRevSubmit(): void {
  syncUrlFromState()
  runDiffLoad(currentRange()).catch((err: unknown) => {
    listError.value = err instanceof Error ? err.message : 'unknown error'
  })
}

/**
 * route.query の変更を watch して range を同期する (ADR 0020 / ADR 0022)。
 *
 * ブラウザの back/forward や外部からの route 変更に対応する。
 * syncUrlFromState 経由の自発的な変更と、ブラウザの back/forward を区別せず、
 * range が変わっていなければ何もしない。
 */
watch(
  () => route.query,
  () => {
    const range = readRangeFromRoute()
    if (range.from === fromRev.value && range.to === toRev.value) return
    fromRev.value = range.from
    toRev.value = range.to
    runDiffLoad(currentRange()).catch((err: unknown) => {
      listError.value = err instanceof Error ? err.message : 'unknown error'
    })
  },
)

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
  isUnmounted = true
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

/**
 * ファイルカードのタブを切り替える。
 * code タブ初回選択時に to 側の blob を取得して Shiki でトークン化する。
 */
function switchTab(entry: FileEntry, tab: ActiveTab): void {
  entry.activeTab = tab
  if (tab === 'code' && entry.codeState.kind === 'idle') {
    void loadCode(entry)
  }
}

async function loadCode(entry: FileEntry): Promise<void> {
  entry.codeState = { kind: 'loading' }
  try {
    const rev = toRev.value === WORKTREE_SENTINEL ? null : toRev.value
    const blob = await fetchBlob(entry.summary.path, rev)
    if (blob === null || blob.binary) {
      entry.codeState = { kind: 'error', message: blob === null ? 'file not found' : 'binary file' }
      return
    }
    const lines = blob.content.split('\n')
    // Shiki でトークン化 (blob-service が返す language を使う)
    let tokens: HighlightedLines | null = null
    if (blob.language !== null) {
      try {
        tokens = await highlighter.highlightFile(blob.content, blob.language)
      } catch {
        // トークン化失敗はプレーン fallback
      }
    }
    entry.codeState = { kind: 'success', lines, tokens }
  } catch (err) {
    entry.codeState = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    }
  }
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

/**
 * Shiki トークンの色を CSS 変数としてインラインスタイルに出す (ADR 0021)。
 *
 * 各 <span class="shiki-tok"> に light 用 (--shiki-l) と dark 用 (--shiki-d) の
 * 2 色を埋め込み、theme.css 側のグローバルセレクタで現在の [data-theme] に
 * 応じて切替える。これによりテーマ変更時にトークンマップの再計算が不要
 * になる。
 *
 * color が null のときは `'inherit'` を入れて親 (cell-* など) の前景色に
 * フォールバックする。
 */
function shikiTokenStyle(tok: HighlightedToken): Record<string, string> {
  return {
    '--shiki-l': tok.color ?? 'inherit',
    '--shiki-d': tok.colorDark ?? 'inherit',
  }
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
  <Teleport to="#page-header-slot">
    <div class="rev-selector">
      <label class="rev-label">
        <span>from:</span>
        <RevisionCombobox
          v-model="fromRev"
          :initial-refs="initialRefs"
          :allow-worktree="false"
          :has-error="listError !== null"
          @submit="onRevSubmit"
        />
      </label>
      <label class="rev-label">
        <span>to:</span>
        <RevisionCombobox
          v-model="toRev"
          :initial-refs="initialRefs"
          :allow-worktree="true"
          :has-error="listError !== null"
          @submit="onRevSubmit"
        />
      </label>
      <button type="button" class="apply" :disabled="loadingList" @click="onApply">適用</button>
    </div>
  </Teleport>
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
          <span class="stats"
            ><span class="stats-addition">+{{ entry.summary.additions }}</span
            >/<span class="stats-deletion">-{{ entry.summary.deletions }}</span></span
          >
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
            <span class="stats"
              ><span class="stats-addition">+{{ entry.summary.additions }}</span
              >/<span class="stats-deletion">-{{ entry.summary.deletions }}</span></span
            >
          </header>
          <div v-show="!entry.collapsed" class="file-body">
            <div class="tab-bar">
              <button
                class="tab-btn"
                :class="{ active: entry.activeTab === 'diff' }"
                @click="switchTab(entry, 'diff')"
              >
                diff
              </button>
              <button
                class="tab-btn"
                :class="{ active: entry.activeTab === 'code' }"
                @click="switchTab(entry, 'code')"
              >
                code
              </button>
            </div>
            <div v-if="entry.activeTab === 'diff'" class="tab-content">
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
                                class="shiki-tok"
                                :style="shikiTokenStyle(tok)"
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
                                class="shiki-tok"
                                :style="shikiTokenStyle(tok)"
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
            <div v-else class="tab-content code-view">
              <p v-if="entry.codeState.kind === 'idle' || entry.codeState.kind === 'loading'">
                loading code...
              </p>
              <p v-else-if="entry.codeState.kind === 'error'" class="error">
                {{ entry.codeState.message }}
              </p>
              <div v-else class="code-lines">
                <div
                  v-for="(line, lineIdx) in entry.codeState.lines"
                  :key="lineIdx"
                  class="code-row"
                >
                  <span class="row-lineno">{{ lineIdx + 1 }}</span>
                  <span class="row-content">
                    <template
                      v-if="
                        entry.codeState.tokens !== null &&
                        entry.codeState.tokens[lineIdx] !== undefined
                      "
                    >
                      <span
                        v-for="(tok, tokIdx) in entry.codeState.tokens[lineIdx]"
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
          </div>
        </article>
      </template>
    </section>
  </div>
</template>

<style scoped>
.rev-selector {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-1);
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.rev-label {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  color: var(--color-fg-muted);
}
.apply {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-fg-disabled);
  background: var(--color-input-bg);
  color: var(--color-fg);
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}
.apply:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.diff-view {
  display: flex;
  gap: 1rem;
  font-family: var(--font-mono);
  margin-top: 1rem;
  align-items: flex-start;
}
.file-list {
  width: 280px;
  border-right: 1px solid var(--color-border);
  padding-right: 1rem;
  position: sticky;
  top: var(--header-height, 0px);
  max-height: calc(100vh - var(--header-height, 0px));
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
  background: var(--color-surface-hover);
}
.status {
  display: inline-block;
  width: 1.2em;
  text-align: center;
  font-weight: bold;
}
.status[data-status='added'] {
  color: var(--color-status-added);
}
.status[data-status='deleted'] {
  color: var(--color-error-strong);
}
.status[data-status='modified'] {
  color: var(--color-status-modified);
}
.path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats {
  font-size: 0.85em;
  color: var(--color-fg-subtle);
}
.stats-addition {
  color: var(--color-stat-addition);
}
.stats-deletion {
  color: var(--color-stat-deletion);
}
.binary {
  font-size: 0.75em;
  color: var(--color-fg-disabled);
}
.file-detail {
  flex: 1;
  min-width: 0;
}
.file-card {
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}
.file-header {
  background: var(--color-surface-2);
  padding: 0.4rem 0.6rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--color-border);
}
.file-header:hover {
  background: var(--color-surface-hover2);
}
.toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 1em;
  line-height: 1;
  width: 1.2em;
  color: var(--color-fg-subtle);
}
.file-body {
  font-size: 0.75rem;
}
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-1);
}
.tab-btn {
  padding: 0.3rem 0.75rem;
  border: none;
  background: none;
  color: var(--color-fg-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85em;
  border-bottom: 2px solid transparent;
}
.tab-btn:hover {
  color: var(--color-fg);
}
.tab-btn.active {
  color: var(--color-fg);
  border-bottom-color: var(--color-fg);
}
.tab-content {
  min-height: 2rem;
}
.code-view {
  overflow-x: auto;
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
.hunk {
  border-top: 1px solid var(--color-border-subtle);
}
.hunk:first-child {
  border-top: none;
}
.hunk-header {
  background: var(--color-surface-hunk);
  padding: 0.2rem 0.5rem;
  color: var(--color-fg-subtle);
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
  border-right: 1px solid var(--color-border);
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
  line-height: 1.667;
  /*
   * 空セルでも 1 行分の高さを確保する。これがないと cell-empty の行が
   * 子要素のテキスト高 0 で collapse し、左右で高さが揃わなくなる。
   */
  min-height: 1.667em;
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
  width: 4em;
  padding: 0 10px;
  text-align: right;
  color: var(--color-fg-faint);
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
  background: var(--color-diff-del-bg);
}
.cell-add {
  background: var(--color-diff-add-bg);
}
.cell-empty {
  background: var(--color-diff-empty-bg);
}
.cell-context {
  background: transparent;
}
.error {
  color: var(--color-error);
  padding: 0.5rem;
}
</style>
