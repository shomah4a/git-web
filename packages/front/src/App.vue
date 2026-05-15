<script setup lang="ts">
import type { RepoInfoDto, WorktreeListItemDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRepoInfo } from './api.js'
import { fetchWorktreesList } from './api/worktrees-list.js'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import { useDocumentTitle } from './composables/use-document-title.js'
import {
  createLocalStorageThemeStorage,
  createMatchMediaSystemWatcher,
  useTheme,
} from './theme/theme-store.js'

const router = useRouter()
const route = useRoute()
const repo = ref<RepoInfoDto | null>(null)
const repoName = computed(() => repo.value?.name ?? null)
const errorMessage = ref<string | null>(null)

/**
 * worktree 一覧 (ADR 0055)。
 *
 * ヘッダの HEAD / branch 表示を URL の `wt` クエリに追従させるために保持する。
 * `wt` 未指定なら default worktree の情報を表示する (起動時 cwd の HEAD と一致)。
 */
const worktrees = ref<ReadonlyArray<WorktreeListItemDto>>([])

/**
 * 現在 URL に指定されている worktree 名。null なら default。
 */
const currentWt = computed<string | null>(() => {
  const raw = route.query.wt
  if (typeof raw !== 'string' || raw === '') return null
  return raw
})

/**
 * 選択中 worktree の表示情報。一覧から URL クエリで引く。
 * worktree 一覧未取得時 (起動直後) は `repo.head` で fallback する。
 */
const activeWorktree = computed<WorktreeListItemDto | null>(() => {
  if (worktrees.value.length === 0) return null
  const wt = currentWt.value
  if (wt === null) {
    for (const item of worktrees.value) {
      if (item.isDefault) return item
    }
    return null
  }
  for (const item of worktrees.value) {
    if (item.name === wt) return item
  }
  return null
})

/**
 * ヘッダに表示する HEAD コミットハッシュ (先頭 7 文字)。
 * worktree 一覧が取得済みなら選択中 worktree、未取得なら起動時 repo のもの。
 */
const headDisplay = computed<{ commitHash: string; branch: string | null } | null>(() => {
  const wt = activeWorktree.value
  if (wt !== null) {
    const hash = wt.headHash === null ? '' : wt.headHash.slice(0, 7)
    return { commitHash: hash, branch: wt.branch }
  }
  if (repo.value !== null) {
    return repo.value.head
  }
  return null
})

/**
 * ページタイトルをルート遷移に応じて動的に更新する (ADR 0041)。
 */
useDocumentTitle(router, repoName)

/**
 * /blob ルートはリビジョンツリーからの遷移なので、
 * Revision タブをアクティブにする (ADR 0028)。
 */
const isRevisionActive = computed(() => {
  const name = route.name
  return name === 'revision-tree' || name === 'blob'
})

const isFullWidthRoute = computed(() => route.name === 'diff' || route.name === 'graph')

/**
 * chromeless モード (ADR 0039)。
 * blob / worktree-blob ルートで chromeless=1 が指定されたときのみヘッダーを非表示にする。
 */
const isChromeless = computed(() => {
  const name = route.name
  return (name === 'blob' || name === 'worktree-blob') && route.query.chromeless === '1'
})

/*
 * テーマストアを初期化 (ADR 0021)。
 * - 本番実装 (localStorage / matchMedia) を factory 経由で組み立てる
 * - resolved (light | dark) を watch して <html data-theme> に反映する
 * - 初期描画のテーマ属性は index.html の FOUC ガードが設定済みのため、
 *   ここでの reflectTheme 呼び出しは「Vue 起動後のユーザー操作による
 *   切替」と「auto 時の OS 設定変更追従」の 2 パスを担当する
 */
const themeStore = useTheme(
  createLocalStorageThemeStorage(window.localStorage),
  createMatchMediaSystemWatcher(window.matchMedia('(prefers-color-scheme: dark)')),
)

function reflectTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

// 初期値も念のため反映 (FOUC ガードと等価になるが、ガードが無効化
// されたときでも setup 完了時点で正しい状態に収束する)
reflectTheme(themeStore.resolved.value)
watch(themeStore.resolved, reflectTheme)

const headerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  if (headerRef.value !== null && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) {
        document.documentElement.style.setProperty(
          '--header-height',
          `${entry.contentRect.height}px`,
        )
      }
    })
    resizeObserver.observe(headerRef.value)
  }

  try {
    repo.value = await fetchRepoInfo()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
  }

  // worktrees-list はヘッダ HEAD 表示の追従用 (ADR 0055)。失敗時は黙って
  // 起動時 cwd の HEAD 表示 (repo.head) に fallback する。
  try {
    const items = await fetchWorktreesList()
    worktrees.value = items
  } catch (err) {
    console.warn('[App] fetchWorktreesList failed', err)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <main>
    <header v-show="!isChromeless" ref="headerRef" class="app-header">
      <div class="app-header-top">
        <h1>
          <router-link to="/">git-web</router-link>
        </h1>
        <p v-if="errorMessage !== null" class="error">error: {{ errorMessage }}</p>
        <dl v-else-if="repo !== null && headDisplay !== null" class="repo-info">
          <dt>repository</dt>
          <dd>{{ activeWorktree?.path ?? repo.cwd }}</dd>
          <dt>HEAD</dt>
          <dd>
            <template v-if="headDisplay.branch !== null">
              {{ headDisplay.branch }} ({{ headDisplay.commitHash }})
            </template>
            <template v-else>
              {{ headDisplay.commitHash }}
            </template>
          </dd>
        </dl>
        <p v-else class="repo-info-loading">loading...</p>
        <ThemeSwitcher
          :model-value="themeStore.theme.value"
          @update:model-value="themeStore.setTheme"
        />
      </div>

      <nav class="view-tabs">
        <router-link class="view-tab" to="/" active-class="" exact-active-class="view-tab--active">
          Worktree
        </router-link>
        <router-link class="view-tab" to="/commits" active-class="view-tab--active">
          History
        </router-link>
        <router-link class="view-tab" to="/graph" active-class="view-tab--active">
          Graph
        </router-link>
        <router-link class="view-tab" to="/diff" active-class="view-tab--active">
          Diff
        </router-link>
        <router-link
          class="view-tab"
          :class="{ 'view-tab--active': isRevisionActive }"
          to="/tree?rev=HEAD"
        >
          Revision
        </router-link>
      </nav>

      <div id="page-header-slot" :class="{ 'content-area': !isFullWidthRoute }"></div>
    </header>

    <div :class="{ 'content-area': !isFullWidthRoute }">
      <router-view />
    </div>
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  padding: 0 1rem;
}
.content-area {
  max-width: 1280px;
  margin: 0 auto;
}
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--color-bg);
  padding-top: 1rem;
  margin: 0 -1rem;
  padding-left: 1rem;
  padding-right: 1rem;
}
.app-header-top {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.app-header-top h1 {
  margin: 0;
  white-space: nowrap;
}
.app-header-top h1 a {
  color: inherit;
  text-decoration: none;
}
.repo-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  color: var(--color-fg-muted);
}
.repo-info dt {
  font-weight: bold;
  margin: 0;
  white-space: nowrap;
}
.repo-info dd {
  margin: 0;
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.repo-info dd + dt {
  margin-left: 0.75rem;
}
.repo-info-loading {
  flex: 1;
  margin: 0;
  color: var(--color-fg-muted);
  font-size: 0.85rem;
}
.view-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
}
.view-tab {
  padding: 0.5rem 1rem;
  color: var(--color-fg-muted);
  text-decoration: none;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.view-tab:hover {
  color: var(--color-fg);
}
.view-tab--active {
  color: var(--color-fg);
  border-bottom-color: var(--color-fg);
}
.error {
  color: var(--color-error);
  margin: 0;
  font-size: 0.85rem;
}
</style>
