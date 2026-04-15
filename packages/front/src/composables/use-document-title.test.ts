import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useDocumentTitle } from './use-document-title.js'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'worktree', component: { template: '<div />' } },
      { path: '/tree', name: 'revision-tree', component: { template: '<div />' } },
      { path: '/blob', name: 'blob', component: { template: '<div />' } },
      { path: '/wt/blob', name: 'worktree-blob', component: { template: '<div />' } },
      { path: '/diff', name: 'diff', component: { template: '<div />' } },
    ],
  })
}

describe('useDocumentTitle', () => {
  it('ルート遷移時にタイトルを更新する', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const repoName = ref<string | null>('my-repo')
    let title = ''
    useDocumentTitle(router, repoName, (t) => {
      title = t
    })

    await router.push('/tree?rev=main&path=src')
    await flushPromises()

    expect(title).toBe('my-repo:main /src - git-web')
  })

  it('repoNameがnullの場合はフォールバックタイトルを設定する', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const repoName = ref<string | null>(null)
    let title = ''
    useDocumentTitle(router, repoName, (t) => {
      title = t
    })

    await router.push('/tree?rev=main')
    await flushPromises()

    expect(title).toBe('git-web')
  })

  it('repoNameが取得された時点で現在ルートに基づいてタイトルを再設定する', async () => {
    const router = createTestRouter()
    await router.push('/blob?rev=abc1234&path=README.md')
    await router.isReady()

    const repoName = ref<string | null>(null)
    let title = ''
    useDocumentTitle(router, repoName, (t) => {
      title = t
    })

    // 初期状態では afterEach が発火済みだがnullなのでフォールバック
    await flushPromises()

    // repoName が設定されると watch が発火してタイトルを再設定する
    repoName.value = 'my-repo'
    await flushPromises()

    expect(title).toBe('my-repo:abc1234 /README.md - git-web')
  })

  it('worktreeルートでは(worktree)をrevとして表示する', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const repoName = ref<string | null>('my-repo')
    let title = ''
    useDocumentTitle(router, repoName, (t) => {
      title = t
    })

    await router.push('/')
    await flushPromises()

    expect(title).toBe('my-repo:(worktree) / - git-web')
  })

  it('diffルートではfromとtoを表示する', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const repoName = ref<string | null>('my-repo')
    let title = ''
    useDocumentTitle(router, repoName, (t) => {
      title = t
    })

    await router.push('/diff?from=HEAD&to=(worktree)')
    await flushPromises()

    expect(title).toBe('my-repo diff HEAD..(worktree) - git-web')
  })
})
