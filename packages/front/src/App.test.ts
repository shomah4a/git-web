import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * App マウント時には /api/repo と DiffView の /api/diff/files が
 * 並行して呼ばれる。URL で分岐する fetch モックをセットする。
 */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function mockFetchByUrl(
  handlers: Readonly<Record<string, () => Response>>,
  fallback: () => Response = () => new Response('not mocked', { status: 500 }),
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input)
      const key = url.split('?')[0] ?? url
      const handler = handlers[key] ?? fallback
      return Promise.resolve(handler())
    }),
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('App.vue', () => {
  it('fetch成功時にrepositoryとHEADを表示する', async () => {
    mockFetchByUrl({
      '/api/repo': () => jsonResponse({ cwd: '/home/u/repo', head: 'deadbeef' }),
      '/api/diff/files': () => jsonResponse({ files: [] }),
    })

    const wrapper = mount(App)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('/home/u/repo')
    expect(text).toContain('deadbeef')
    expect(text).not.toContain('loading...')
  })

  it('fetch失敗時にerrorを表示する', async () => {
    mockFetchByUrl({
      '/api/repo': () => new Response('', { status: 500 }),
      '/api/diff/files': () => jsonResponse({ files: [] }),
    })

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('HTTP 500')
  })

  it('DiffView が App 内にマウントされる', async () => {
    mockFetchByUrl({
      '/api/repo': () => jsonResponse({ cwd: '/r', head: 'abc' }),
      '/api/diff/files': () =>
        jsonResponse({
          files: [
            {
              path: 'foo.ts',
              oldPath: null,
              status: 'modified',
              additions: 2,
              deletions: 1,
              binary: false,
            },
          ],
        }),
    })

    const wrapper = mount(App)
    await flushPromises()

    // DiffView のファイル一覧が表示される
    expect(wrapper.text()).toContain('foo.ts')
    expect(wrapper.text()).toContain('Files')
  })
})
