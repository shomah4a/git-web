import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

    const wrapper = mount(DiffView)
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

    const wrapper = mount(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('HTTP 500')
  })

  it('変更なしの場合は no changes を表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [] }),
    })

    const wrapper = mount(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('no changes')
  })

  it('マウント時に全ファイルの diff を並列取得してまとめて表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mount(DiffView)
    await flushPromises()

    const cards = wrapper.findAll('.file-card')
    expect(cards).toHaveLength(2)
    // それぞれのカードに hunk が描画される
    expect(cards[0]?.text()).toContain('@@ -1,2 +1,2 @@')
    expect(cards[1]?.text()).toContain('@@ -0,0 +1,2 @@')
    // Split View: foo.ts は [delete+add ペア, context] の 2 行になる
    const rowsA = cards[0]?.findAll('.split-row') ?? []
    expect(rowsA).toHaveLength(2)
    // 1 行目は左に delete、右に add を含む
    expect(rowsA[0]?.findAll('.cell-delete').length).toBeGreaterThan(0)
    expect(rowsA[0]?.findAll('.cell-add').length).toBeGreaterThan(0)
    expect(rowsA[0]?.text()).toContain('old')
    expect(rowsA[0]?.text()).toContain('new')
    // 2 行目は両側 context (lineno + content の計 4 セルに cell-context が付く)
    expect(rowsA[1]?.findAll('.cell-context').length).toBe(4)
    expect(rowsA[1]?.text()).toContain('tail')
  })

  it('個別ファイルの取得が 404 ならそのカードのみ no diff to display を表示する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] }),
      '/api/diff/file|foo.ts': () => new Response('', { status: 404 }),
      '/api/diff/file|bar.py': () => jsonResponse(200, FILE_B),
    })

    const wrapper = mount(DiffView)
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

    const wrapper = mount(DiffView)
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

    const wrapper = mount(DiffView, { attachTo: document.body })
    await flushPromises()

    scrollIntoViewCalls = 0
    await wrapper.findAll('.file-list li')[1]?.trigger('click')

    expect(scrollIntoViewCalls).toBe(1)
    wrapper.unmount()
  })

  it('ファイルヘッダークリックで折りたたまれ、再度クリックで展開する', async () => {
    mockFetchByUrl({
      '/api/diff/files': () => jsonResponse(200, { files: [SUMMARY_A] }),
      '/api/diff/file|foo.ts': () => jsonResponse(200, FILE_A),
    })

    const wrapper = mount(DiffView)
    await flushPromises()

    // 初期状態は展開
    expect(wrapper.find('.file-body').exists()).toBe(true)
    expect(wrapper.find('.toggle').text()).toBe('▾')

    // クリックで折りたたむ
    await wrapper.find('.file-header').trigger('click')
    expect(wrapper.find('.file-body').exists()).toBe(false)
    expect(wrapper.find('.toggle').text()).toBe('▸')

    // もう一度クリックで展開
    await wrapper.find('.file-header').trigger('click')
    expect(wrapper.find('.file-body').exists()).toBe(true)
    expect(wrapper.find('.toggle').text()).toBe('▾')
  })
})
