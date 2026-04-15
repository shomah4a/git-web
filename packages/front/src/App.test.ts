import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
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
      '/api/repo': () =>
        jsonResponse({
          name: 'repo',
          cwd: '/home/u/repo',
          head: { commitHash: 'deadbeef', branch: 'main' },
        }),
      '/api/diff/files': () => jsonResponse({ files: [] }),
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('/home/u/repo')
    expect(text).toContain('main')
    expect(text).toContain('deadbeef')
    expect(text).not.toContain('loading...')
  })

  it('detached HEADではコミットハッシュのみ表示しブランチ名は表示しない', async () => {
    mockFetchByUrl({
      '/api/repo': () =>
        jsonResponse({
          name: 'repo',
          cwd: '/home/u/repo',
          head: { commitHash: 'cafebabe', branch: null },
        }),
      '/api/diff/files': () => jsonResponse({ files: [] }),
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('cafebabe')
    expect(text).not.toContain('(cafebabe)')
  })

  it('fetch失敗時にerrorを表示する', async () => {
    mockFetchByUrl({
      '/api/repo': () => new Response('', { status: 500 }),
      '/api/diff/files': () => jsonResponse({ files: [] }),
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('HTTP 500')
  })

  it('デフォルトルートで WorktreeView がマウントされる', async () => {
    mockFetchByUrl({
      '/api/repo': () =>
        jsonResponse({ name: 'r', cwd: '/r', head: { commitHash: 'abc', branch: 'main' } }),
      '/api/worktree': () =>
        jsonResponse({
          entries: [
            {
              name: 'src',
              path: 'src',
              type: 'tree',
              status: null,
              mode: '040000',
              size: null,
            },
          ],
        }),
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: () => import('./components/WorktreeView.vue'),
        },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('src')
  })
})
