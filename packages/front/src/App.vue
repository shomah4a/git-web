<script setup lang="ts">
import type { RepoInfoDto } from '@git-web/common'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRepoInfo } from './api.js'
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
        <dl v-else-if="repo !== null" class="repo-info">
          <dt>repository</dt>
          <dd>{{ repo.cwd }}</dd>
          <dt>HEAD</dt>
          <dd>
            <template v-if="repo.head.branch !== null">
              {{ repo.head.branch }} ({{ repo.head.commitHash }})
            </template>
            <template v-else>
              {{ repo.head.commitHash }}
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

      <div id="page-header-slot"></div>
    </header>

    <router-view />
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  padding: 0 1rem;
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
