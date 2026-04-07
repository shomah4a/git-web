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

beforeEach(() => {
  vi.restoreAllMocks()
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

function mockFetchSequence(responses: ReadonlyArray<Response>): void {
  let idx = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const response = responses[idx]
      idx++
      if (response === undefined) {
        return Promise.reject(new Error('no more mocked response'))
      }
      return Promise.resolve(response)
    }),
  )
}

describe('DiffView', () => {
  it('マウント時にファイル一覧を取得して表示する', async () => {
    mockFetchSequence([jsonResponse(200, { files: [SUMMARY_A, SUMMARY_B] })])

    const wrapper = mount(DiffView)
    await flushPromises()

    const items = wrapper.findAll('.file-list li')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('foo.ts')
    expect(items[1]?.text()).toContain('bar.py')
  })

  it('ファイル一覧取得に失敗するとエラーメッセージを表示する', async () => {
    mockFetchSequence([new Response('boom', { status: 500 })])

    const wrapper = mount(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('HTTP 500')
  })

  it('変更なしの場合は no changes を表示する', async () => {
    mockFetchSequence([jsonResponse(200, { files: [] })])

    const wrapper = mount(DiffView)
    await flushPromises()

    expect(wrapper.text()).toContain('no changes')
  })

  it('ファイルをクリックすると個別 diff を取得して表示する', async () => {
    mockFetchSequence([jsonResponse(200, { files: [SUMMARY_A] }), jsonResponse(200, FILE_A)])

    const wrapper = mount(DiffView)
    await flushPromises()
    const firstItem = wrapper.find('.file-list li')
    await firstItem.trigger('click')
    await flushPromises()

    // hunk ヘッダとファイルパスが右ペインに出る
    expect(wrapper.text()).toContain('foo.ts')
    expect(wrapper.text()).toContain('@@ -1,2 +1,2 @@')
    // add 行と delete 行が描画される
    const lines = wrapper.findAll('.line')
    expect(lines.length).toBe(3)
    expect(lines[0]?.classes()).toContain('delete')
    expect(lines[1]?.classes()).toContain('add')
    expect(lines[2]?.classes()).toContain('context')
  })

  it('個別 diff が 404 なら no diff to display を表示する', async () => {
    mockFetchSequence([
      jsonResponse(200, { files: [SUMMARY_A] }),
      new Response('', { status: 404 }),
    ])

    const wrapper = mount(DiffView)
    await flushPromises()
    await wrapper.find('.file-list li').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('no diff to display for foo.ts')
  })

  it('個別 diff が失敗したらエラー表示する', async () => {
    mockFetchSequence([
      jsonResponse(200, { files: [SUMMARY_A] }),
      new Response('', { status: 500 }),
    ])

    const wrapper = mount(DiffView)
    await flushPromises()
    await wrapper.find('.file-list li').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('HTTP 500')
  })
})
