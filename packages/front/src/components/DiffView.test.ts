import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBlob } from '../api/blob.js'
import { fetchRefs } from '../api/refs.js'
import {
  createDeferredFakeHighlighter,
  createFakeHighlighter,
} from '../test-utils/fake-highlighter.js'
import { mountWithHighlighter } from '../test-utils/mount-with-highlighter.js'
import DiffView from './DiffView.vue'

// /api/blob の fetch はテスト全体で stub する。default は null (404 相当)
// にすることで、既存テスト (blob に関心のないケース) では silent fallback に
// 倒れて挙動が変わらないようにする。
vi.mock('../api/blob.js', () => ({
  fetchBlob: vi.fn(),
}))
const mockedFetchBlob = vi.mocked(fetchBlob)

// ADR 0019: DiffView マウント時に fetchRefs('', 50) が並列発火されるため、
// refs API もテスト全体で stub する。既定では空の RefList を返す。
vi.mock('../api/refs.js', () => ({
  fetchRefs: vi.fn(),
}))
const mockedFetchRefs = vi.mocked(fetchRefs)

const SUMMARY_A = {
  path: 'foo.ts',
  oldPath: null,
  status: 'modified',
  additions: 3,
  deletions: 1,
  binary: false,
}

const SUMMARY_B = {
  path: 'bar.py',
  oldPath: null,
  status: 'added',
  additions: 10,
  deletions: 0,
  binary: false,
}

const FILE_A = {
  path: 'foo.ts',
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  language: 'typescript',
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      header: '',
      lines: [
        { kind: 'delete', content: 'old', oldLineNo: 1, newLineNo: null },
        { kind: 'add', content: 'new', oldLineNo: null, newLineNo: 1 },
        { kind: 'context', content: 'tail', oldLineNo: 2, newLineNo: 2 },
      ],
    },
  ],
}

const FILE_B = {
  path: 'bar.py',
  oldPath: null,
  status: 'added',
  additions: 2,
  deletions: 0,
  binary: false,
  language: 'python',
  hunks: [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 2,
      header: '',
      lines: [
        { kind: 'add', content: 'x = 1', oldLineNo: null, newLineNo: 1 },
        { kind: 'add', content: 'y = 2', oldLineNo: null, newLineNo: 2 },
      ],
    },
  ],
}

let scrollIntoViewCalls = 0

beforeEach(() => {
  vi.restoreAllMocks()
  // fetchBlob の default は null (404 相当、既存テストと同等の silent fallback)
  // vi.mock で差し替えた mock の呼び出し履歴は restoreAllMocks でクリアされない
  // ケースがあるので明示的にクリアする
  mockedFetchBlob.mockClear()
  mockedFetchBlob.mockResolvedValue(null)
  mockedFetchRefs.mockClear()
  mockedFetchRefs.mockResolvedValue({
    head: 'main',
    branches: ['main'],
    tags: [],
    truncated: false,
  })
  // jsdom は scrollIntoView を実装していないので差し替える。
  // vitest 4.x の vi.fn ジェネリクスが Element.scrollIntoView の型と噛み合わないため、
  // 手動でコールカウントを取る。
  scrollIntoViewCalls = 0
  Element.prototype.scrollIntoView = function scrollIntoViewStub(): void {
    scrollIntoViewCalls += 1
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * DiffView の defineExpose で公開された runDiffLoad を型安全に取り出すための
 * ユーザー定義型ガード。ADR 0010 の `as` 禁止を守りつつ narrow する。
 *
 * ADR 0019 で runDiffLoad は range?: DiffRangeQuery を受け取れるよう拡張された。
 */
type RunDiffLoadFn = (range?: { from?: string; to?: string }) => Promise<void>

function hasRunDiffLoad(vm: unknown): vm is { runDiffLoad: RunDiffLoadFn } {
  if (typeof vm !== 'object' || vm === null) return false
  if (!('runDiffLoad' in vm)) return false
  return typeof vm.runDiffLoad === 'function'
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * URL の path 部分 (クエリ除く) と `path` クエリパラメータの組で handler を振り分ける。
 * /api/diff/file は path クエリで個別ファイル毎にレスポンスを切り替える。
 */
function mockFetchByUrl(
  handlers: Readonly<Record<string, () => Response>>,
  fallback: () => Response = () => new Response('not mocked', { status: 500 }),
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const [base, query] = url.split('?')
      const params = new URLSearchParams(query ?? '')
      const pathParam = params.get('path')
      const key = pathParam === null ? (base ?? url) : `${base ?? url}|${pathParam}`
      const handler = handlers[key] ?? fallback
      return Promise.resolve(handler())
    }),
  )
}

describe('DiffView', () => {
  it('マウント時にファイル一覧を取得して左ペインに表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    const items = wrapper.findAll('.file-list li')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('foo.ts')
    expect(items[1]?.text()).toContain('bar.py')
  })

  it('ファイル一覧取得に失敗するとエラーメッセージを表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => new Response('boom', { status: 500 }),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('HTTP 500')
  })

  it('変更なしの場合は no changes を表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('no changes')
  })

  it('マウント時に全ファイルの diff を並列取得してまとめて表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    const cards = wrapper.findAll('.file-card')
    expect(cards).toHaveLength(2)
    // それぞれのカードに hunk が描画される
    expect(cards[0]?.text()).toContain('@@ -1,2 +1,2 @@')
    expect(cards[1]?.text()).toContain('@@ -0,0 +1,2 @@')
    // Split View (ペアリング方式): foo.ts は [delete+add ペア, context] の 2 行
    const leftA = cards[0]?.find('.side-left')
    const rightA = cards[0]?.find('.side-right')
    expect(leftA?.exists()).toBe(true)
    expect(rightA?.exists()).toBe(true)
    const leftRowsA = leftA?.findAll('.row') ?? []
    const rightRowsA = rightA?.findAll('.row') ?? []
    expect(leftRowsA).toHaveLength(2)
    expect(rightRowsA).toHaveLength(2)
    // 1 行目: 左は delete で 'old'、右は add で 'new'
    expect(leftRowsA[0]?.classes()).toContain('cell-delete')
    expect(leftRowsA[0]?.text()).toContain('old')
    expect(rightRowsA[0]?.classes()).toContain('cell-add')
    expect(rightRowsA[0]?.text()).toContain('new')
    // 2 行目: 両側とも context で 'tail'
    expect(leftRowsA[1]?.classes()).toContain('cell-context')
    expect(rightRowsA[1]?.classes()).toContain('cell-context')
    expect(leftRowsA[1]?.text()).toContain('tail')
    expect(rightRowsA[1]?.text()).toContain('tail')
  })

  it('個別ファイルの取得が 404 ならそのカードのみ no diff to display を表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => new Response('', { status: 404 }),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    const cards = wrapper.findAll('.file-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('no diff to display for foo.ts')
    // 他のファイルは通常通り表示される
    expect(cards[1]?.text()).toContain('@@ -0,0 +1,2 @@')
  })

  it('個別ファイルの取得が失敗してもそのカードのみエラーを表示し他は継続する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => new Response('', { status: 500 }),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    const cards = wrapper.findAll('.file-card')
    expect(cards[0]?.text()).toContain('HTTP 500')
    expect(cards[1]?.text()).toContain('@@ -0,0 +1,2 @@')
  })

  it('ファイル一覧のクリックで該当カードの scrollIntoView を呼ぶ', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()

    scrollIntoViewCalls = 0
    await wrapper.findAll('.file-list li')[1]?.trigger('click')

    expect(scrollIntoViewCalls).toBe(1)
    wrapper.unmount()
  })

  it('左側をスクロールすると右側の scrollLeft が同じ値に同期する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })

    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()

    const left = wrapper.find<HTMLElement>('.side-left').element
    const right = wrapper.find<HTMLElement>('.side-right').element

    left.scrollLeft = 120
    left.dispatchEvent(new Event('scroll'))

    expect(right.scrollLeft).toBe(120)
    wrapper.unmount()
  })

  it('右側をスクロールすると左側の scrollLeft が同じ値に同期する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })

    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()

    const left = wrapper.find<HTMLElement>('.side-left').element
    const right = wrapper.find<HTMLElement>('.side-right').element

    right.scrollLeft = 77
    right.dispatchEvent(new Event('scroll'))

    expect(left.scrollLeft).toBe(77)
    wrapper.unmount()
  })

  it('scroll 同期が isSyncing フラグで無限ループしない', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })

    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()

    const left = wrapper.find<HTMLElement>('.side-left').element
    const right = wrapper.find<HTMLElement>('.side-right').element

    // jsdom は scrollLeft 代入で scroll イベントを自動発火しないため、
    // 本物のブラウザで発生する「dst 側にも scroll イベントが飛ぶ」状況を
    // 手動で再現する。isSyncing が効いていれば再入時に src は書き換わらない。
    const leftSpy = vi.fn(() => {
      right.scrollLeft = left.scrollLeft
      right.dispatchEvent(new Event('scroll'))
    })
    left.addEventListener('scroll', leftSpy)

    left.scrollLeft = 50
    left.dispatchEvent(new Event('scroll'))

    expect(leftSpy).toHaveBeenCalledTimes(1)
    expect(right.scrollLeft).toBe(50)
    wrapper.unmount()
  })

  it('複数 hunk がある場合はそれぞれの hunk で独立にスクロール同期する', async () => {
    const FILE_TWO_HUNKS = {
      path: 'foo.ts',
      oldPath: null,
      status: 'modified',
      additions: 2,
      deletions: 2,
      binary: false,
      language: 'typescript',
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          header: '',
          lines: [
            { kind: 'delete', content: 'a', oldLineNo: 1, newLineNo: null },
            { kind: 'add', content: 'A', oldLineNo: null, newLineNo: 1 },
          ],
        },
        {
          oldStart: 10,
          oldLines: 1,
          newStart: 10,
          newLines: 1,
          header: '',
          lines: [
            { kind: 'delete', content: 'b', oldLineNo: 10, newLineNo: null },
            { kind: 'add', content: 'B', oldLineNo: null, newLineNo: 10 },
          ],
        },
      ],
    }

    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_TWO_HUNKS),
    })

    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()

    const hunks = wrapper.findAll('.hunk-content')
    expect(hunks).toHaveLength(2)

    const left0 = hunks[0]?.find<HTMLElement>('.side-left').element
    const right0 = hunks[0]?.find<HTMLElement>('.side-right').element
    const left1 = hunks[1]?.find<HTMLElement>('.side-left').element
    const right1 = hunks[1]?.find<HTMLElement>('.side-right').element
    if (
      left0 === undefined ||
      right0 === undefined ||
      left1 === undefined ||
      right1 === undefined
    ) {
      throw new Error('hunk side element not found')
    }

    // hunk 0 の左をスクロール
    left0.scrollLeft = 30
    left0.dispatchEvent(new Event('scroll'))

    // hunk 0 は同期される
    expect(right0.scrollLeft).toBe(30)
    // hunk 1 は影響を受けない
    expect(left1.scrollLeft).toBe(0)
    expect(right1.scrollLeft).toBe(0)

    wrapper.unmount()
  })

  it('ファイルヘッダークリックで折りたたまれ、再度クリックで展開する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    // 初期状態は展開 (v-show なので DOM は常に存在する)
    // v-show は inline style で display を操作するので element.style.display を直接検証する
    const body = wrapper.find<HTMLElement>('.file-body').element
    expect(body.style.display).toBe('')
    expect(wrapper.find('.toggle').text()).toBe('▾')

    // クリックで折りたたむ (display:none になる)
    await wrapper.find('.file-header').trigger('click')
    expect(body.style.display).toBe('none')
    expect(wrapper.find('.toggle').text()).toBe('▸')

    // もう一度クリックで展開
    await wrapper.find('.file-header').trigger('click')
    expect(body.style.display).toBe('')
    expect(wrapper.find('.toggle').text()).toBe('▾')
  })

  // ---------- 構文ハイライト (ADR 0017) ----------

  const BLOB_FOO = {
    path: 'foo.ts',
    rev: null,
    content: 'old\ntail\n',
    binary: false,
    language: 'typescript',
  }

  it('no-op Highlighter 注入時は従来通り content がそのまま描画される (9-2-a)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()

    // row-content 内の text が従来通りに出る (no-op は null を返さずプレーンなトークン列を返す)
    // どちらであっても最終的な textContent は同じ
    const rows = wrapper.findAll('.side-left .row')
    expect(rows[0]?.text()).toContain('old')
    expect(rows[1]?.text()).toContain('tail')
  })

  it('フェイク Highlighter 注入時はトークンに対応する色付き span が描画される (9-2-b)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    // typescript の全行に対して同じトークン列 (赤 'KW' + 黒 'rest') を返す
    const red = '#ff0000'
    const black = '#000000'
    const lines = [
      [
        { content: 'KW', color: red },
        { content: ' rest', color: black },
      ],
      [
        { content: 'KW', color: red },
        { content: ' rest', color: black },
      ],
      [{ content: '', color: null }],
    ]
    const fake = createFakeHighlighter(new Map([['typescript', lines]]))

    const wrapper = mountWithHighlighter(DiffView, fake)
    await flushPromises()

    // 最初の .side-left .row の row-content 内に色付き span が存在する
    const firstRowContent = wrapper.find('.side-left .row .row-content')
    const spans = firstRowContent.findAll('span')
    expect(spans.length).toBeGreaterThan(0)
    // 赤色を持つ span が少なくとも 1 つある
    const hasRedSpan = spans.some((s) => (s.attributes('style') ?? '').includes('rgb(255, 0, 0)'))
    expect(hasRedSpan).toBe(true)
  })

  it('blob 取得が失敗するとそのファイルはプレーン fallback される (9-2-c)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockRejectedValue(new Error('blob fetch boom'))

    const fake = createFakeHighlighter(
      new Map([['typescript', [[{ content: 'should-not-appear', color: '#ff0000' }]]]]),
    )
    const wrapper = mountWithHighlighter(DiffView, fake)
    await flushPromises()

    // blob が取れない → highlightFile が呼ばれない → プレーン描画
    const leftRow = wrapper.find('.side-left .row')
    expect(leftRow.text()).toContain('old')
    expect(leftRow.text()).not.toContain('should-not-appear')
  })

  it('binary ファイルと language===null のファイルでは fetchBlob が呼ばれない (9-2-f)', async () => {
    const BINARY_SUMMARY = { ...SUMMARY_A, path: 'logo.png', binary: true }
    const BINARY_FILE = {
      ...FILE_A,
      path: 'logo.png',
      binary: true,
      language: null,
      hunks: [],
    }
    const PLAIN_SUMMARY = { ...SUMMARY_A, path: 'README' }
    const PLAIN_FILE = { ...FILE_A, path: 'README', language: null }

    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [BINARY_SUMMARY, PLAIN_SUMMARY] }),
      '/api/diff/file|logo.png': () => jsonResponse(200, BINARY_FILE),
      '/api/diff/file|README': () => jsonResponse(200, PLAIN_FILE),
    })

    mountWithHighlighter(DiffView)
    await flushPromises()

    expect(mockedFetchBlob).not.toHaveBeenCalled()
  })

  it('status=added では old 側の blob を取得せず、status=deleted では new 側を取得しない (9-2-g)', async () => {
    const ADDED_SUMMARY = { ...SUMMARY_A, path: 'added.ts', status: 'added' }
    const ADDED_FILE = { ...FILE_A, path: 'added.ts', status: 'added' }
    const DELETED_SUMMARY = { ...SUMMARY_A, path: 'deleted.ts', status: 'deleted' }
    const DELETED_FILE = { ...FILE_A, path: 'deleted.ts', status: 'deleted' }

    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [ADDED_SUMMARY, DELETED_SUMMARY] }),
      '/api/diff/file|added.ts': () => jsonResponse(200, ADDED_FILE),
      '/api/diff/file|deleted.ts': () => jsonResponse(200, DELETED_FILE),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    mountWithHighlighter(DiffView)
    await flushPromises()

    // added.ts: new (rev=null) のみ、old (HEAD) は呼ばない
    // deleted.ts: old (HEAD) のみ、new (rev=null) は呼ばない
    const calls = mockedFetchBlob.mock.calls
    const addedCalls = calls.filter((c) => c[0] === 'added.ts')
    const deletedCalls = calls.filter((c) => c[0] === 'deleted.ts')

    expect(addedCalls).toHaveLength(1)
    expect(addedCalls[0]?.[1]).toBeNull()
    expect(deletedCalls).toHaveLength(1)
    expect(deletedCalls[0]?.[1]).toBe('HEAD')
  })

  it('512KB を超える blob はプレーン fallback され highlightFile が呼ばれない (9-2-h)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    const hugeContent = 'a'.repeat(513 * 1024) // 閾値 512KB を超える
    mockedFetchBlob.mockResolvedValue({ ...BLOB_FOO, content: hugeContent })

    // フェイクは呼ばれたら例外を投げ、呼び出し検知に使う
    let highlightCalled = false
    const fake = createFakeHighlighter(new Map())
    const wrapHighlight = fake.highlightFile.bind(fake)
    fake.highlightFile = (content, lang) => {
      highlightCalled = true
      return wrapHighlight(content, lang)
    }

    const wrapper = mountWithHighlighter(DiffView, fake)
    await flushPromises()

    expect(highlightCalled).toBe(false)
    // プレーン描画のまま (content はそのまま)
    expect(wrapper.find('.side-left .row').text()).toContain('old')
  })

  it('generation race: 同一インスタンス内で runDiffLoad を再実行し、先発の highlightFile が後発完了の後で resolve しても tokenMap に反映されない (9-2-d)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    // 同一 highlighter だが、2 回目以降の呼び出しは即時 WIN で解決する
    // ように setImmediateResult で挙動を切り替える。これで「1 回目 =
    // 保留、2 回目 = 即時解決」という時系列を同一 DI 下で作れる。
    const deferred = createDeferredFakeHighlighter()
    const winningLines = [[{ content: 'WIN', color: '#00ff00' }]]
    const losingLines = [[{ content: 'LOSE', color: '#ff0000' }]]

    const wrapper = mountWithHighlighter(DiffView, deferred.highlighter)
    await flushPromises()
    // 1 回目の runDiffLoad が blob 取得後に highlightFile を呼び pending
    expect(deferred.pendingCount()).toBeGreaterThan(0)

    // 2 回目以降の highlightFile は即時 WIN を返すモードに切替
    deferred.setImmediateResult(winningLines)

    // defineExpose した runDiffLoad を同一インスタンスで再実行
    const vm: unknown = wrapper.vm
    if (!hasRunDiffLoad(vm)) {
      throw new Error('runDiffLoad is not exposed on DiffView instance')
    }
    const secondRun = vm.runDiffLoad()
    await secondRun
    await flushPromises()

    // 2 回目が完了しているので WIN が DOM に出ている
    const afterSecond = wrapper.find('.side-left .row .row-content').html()
    expect(afterSecond).toContain('WIN')

    // 先発 (generation=1) を後から解決する。先発の runDiffLoad は
    // myGen !== generation (現在 2) で早期 return して tokenMap を
    // 上書きしないはず
    deferred.resolveAll(losingLines)
    await flushPromises()

    const afterLose = wrapper.find('.side-left .row .row-content').html()
    expect(afterLose).toContain('WIN')
    expect(afterLose).not.toContain('LOSE')
  })

  // ------------------------------------------------------------------
  // ADR 0019: from/to セレクタ
  // ------------------------------------------------------------------

  /**
   * 適用ボタンクリック経由で runDiffLoad が range 付きで呼ばれることを
   * 検証するため、fetch の呼び出し URL を記録するユーティリティ。
   */
  function mockFetchByUrlTracked(handlers: Readonly<Record<string, () => Response>>): {
    urls: string[]
  } {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        urls.push(url)
        const [base, query] = url.split('?')
        const params = new URLSearchParams(query ?? '')
        const pathParam = params.get('path')
        const key = pathParam === null ? (base ?? url) : `${base ?? url}|${pathParam}`
        const handler = handlers[key] ?? (() => new Response('not mocked', { status: 500 }))
        return Promise.resolve(handler())
      }),
    )
    return { urls }
  }

  it('マウント時に fetchRefs が空文字 q で呼ばれ初期候補を読み込む (ADR 0019)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })
    mountWithHighlighter(DiffView)
    await flushPromises()
    expect(mockedFetchRefs).toHaveBeenCalledTimes(1)
    expect(mockedFetchRefs).toHaveBeenCalledWith('', 50)
  })

  it('マウント時の fetchDiffFiles は from=HEAD クエリ付きで呼ばれる (ADR 0019)', async () => {
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })
    mountWithHighlighter(DiffView)
    await flushPromises()
    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toBeDefined()
    expect(filesCall).toContain('from=HEAD')
    expect(filesCall).not.toContain('to=')
  })

  it('runDiffLoad に range を渡すと fetchDiffFiles と blob fetch の rev が range から決まる (ADR 0019 HIGH-1)', async () => {
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()
    mockedFetchBlob.mockClear()
    tracker.urls.length = 0

    const vm: unknown = wrapper.vm
    if (!hasRunDiffLoad(vm)) {
      throw new Error('runDiffLoad is not exposed on DiffView instance')
    }
    await vm.runDiffLoad({ from: 'feature/foo', to: 'main' })
    await flushPromises()

    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toContain('from=feature%2Ffoo')
    expect(filesCall).toContain('to=main')

    // blob fetch の old/new rev が range から導出される
    const blobCalls = mockedFetchBlob.mock.calls.filter((c) => c[0] === 'foo.ts')
    const oldSideCall = blobCalls.find((c) => c[1] === 'feature/foo')
    const newSideCall = blobCalls.find((c) => c[1] === 'main')
    expect(oldSideCall).toBeDefined()
    expect(newSideCall).toBeDefined()
  })

  it('to=(worktree) のときは API クエリの to が省略される (ADR 0019)', async () => {
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })
    mockedFetchBlob.mockResolvedValue(BLOB_FOO)

    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()
    mockedFetchBlob.mockClear()
    tracker.urls.length = 0

    const vm: unknown = wrapper.vm
    if (!hasRunDiffLoad(vm)) {
      throw new Error('runDiffLoad is not exposed on DiffView instance')
    }
    // 適用ボタン経由を模倣: range は現在の state から作られる前提
    await vm.runDiffLoad({ from: 'main' })
    await flushPromises()

    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toContain('from=main')
    expect(filesCall).not.toContain('to=')

    // new 側 blob は worktree (rev=null)
    const blobCalls = mockedFetchBlob.mock.calls.filter((c) => c[0] === 'foo.ts')
    expect(blobCalls.some((c) => c[1] === null)).toBe(true)
    expect(blobCalls.some((c) => c[1] === 'main')).toBe(true)
  })

  it('適用ボタンクリックで runDiffLoad が current range で呼ばれる (ADR 0019)', async () => {
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })
    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()
    tracker.urls.length = 0

    const button = wrapper.find('.apply')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()

    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toContain('from=HEAD')
  })

  it('loadingList 中は適用ボタンが disabled になる (ADR 0019 MEDIUM-4)', async () => {
    // fetchDiffFiles の解決を手動で制御するため deferred Response を使う
    let resolveFetch: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolveFetch = r
          }),
      ),
    )
    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()
    const button = wrapper.find('.apply')
    expect(button.attributes('disabled')).toBeDefined()

    // 解決するとボタンが押せるようになる
    resolveFetch(jsonResponse(200, { files: [] }))
    await flushPromises()
    expect(wrapper.find('.apply').attributes('disabled')).toBeUndefined()
  })

  it('候補クリック相当の操作で runDiffLoad が自動適用される (ADR 0019)', async () => {
    mockedFetchRefs.mockResolvedValue({
      head: 'main',
      branches: ['main', 'feature/foo'],
      tags: [],
      truncated: false,
    })
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })
    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()
    tracker.urls.length = 0

    // from 側 combobox の候補をクリック (候補は head=main + branches)
    const fromInput = wrapper.findAll('input[role="combobox"]')[0]
    await fromInput?.trigger('focus')
    const options = wrapper.findAll('[role="option"]')
    // [0]=main (head と branches の重複排除), [1]=feature/foo
    await options[1]?.trigger('mousedown')
    await flushPromises()

    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toContain('from=feature%2Ffoo')
    wrapper.unmount()
  })

  it('blur 経由 (値だけ変えてフォーカスを外す) では自動適用されない (ADR 0019)', async () => {
    const tracker = mockFetchByUrlTracked({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })
    const wrapper = mountWithHighlighter(DiffView, undefined, { attachTo: document.body })
    await flushPromises()
    tracker.urls.length = 0

    const fromInput = wrapper.findAll('input[role="combobox"]')[0]
    await fromInput?.setValue('main')
    await fromInput?.trigger('blur')
    // blur の 150ms 遅延 close と commitImplicit を進める
    await new Promise((r) => setTimeout(r, 200))
    await flushPromises()

    const filesCall = tracker.urls.find((u) => u.startsWith('/api/diff/files'))
    expect(filesCall).toBeUndefined()
    wrapper.unmount()
  })

  it('listError があると from/to combobox に has-error クラスが伝播する (ADR 0019 MEDIUM-1)', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => new Response('boom', { status: 500 }),
    })
    const wrapper = mountWithHighlighter(DiffView)
    await flushPromises()
    const comboboxes = wrapper.findAll('.revision-combobox')
    expect(comboboxes).toHaveLength(2)
    for (const c of comboboxes) {
      expect(c.classes()).toContain('has-error')
    }
  })
})
