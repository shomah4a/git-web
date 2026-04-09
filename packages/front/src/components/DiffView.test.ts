import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithHighlighter } from '../test-utils/mount-with-highlighter.js'
import DiffView from './DiffView.vue'

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
})
