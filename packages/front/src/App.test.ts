import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App.vue', () => {
  it('fetch成功時にrepositoryとHEADを表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cwd: '/home/u/repo', head: 'deadbeef' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    const wrapper = mount(App)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('/home/u/repo')
    expect(text).toContain('deadbeef')
    expect(text).not.toContain('loading')
  })

  it('fetch失敗時にerrorを表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('error:')
    expect(wrapper.text()).toContain('network down')
  })
})
