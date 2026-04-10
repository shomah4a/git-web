<script setup lang="ts">
import type { RepoInfoDto } from '@git-web/common'
import { onMounted, ref, watch } from 'vue'
import { fetchRepoInfo } from './api.js'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import {
  createLocalStorageThemeStorage,
  createMatchMediaSystemWatcher,
  useTheme,
} from './theme/theme-store.js'

const repo = ref<RepoInfoDto | null>(null)
const errorMessage = ref<string | null>(null)

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

onMounted(async () => {
  try {
    repo.value = await fetchRepoInfo()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
  }
})
</script>

<template>
  <main>
    <header class="app-header">
      <h1>
        <router-link to="/">git-web</router-link>
      </h1>
      <ThemeSwitcher
        :model-value="themeStore.theme.value"
        @update:model-value="themeStore.setTheme"
      />
    </header>
    <p v-if="errorMessage !== null" class="error">error: {{ errorMessage }}</p>
    <dl v-else-if="repo !== null">
      <dt>repository</dt>
      <dd>{{ repo.cwd }}</dd>
      <dt>HEAD</dt>
      <dd>{{ repo.head }}</dd>
    </dl>
    <p v-else>loading...</p>

    <router-view />
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  margin: 2rem auto;
  padding: 0 1rem;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.app-header h1 {
  margin: 0;
}
.app-header h1 a {
  color: inherit;
  text-decoration: none;
}
.error {
  color: var(--color-error);
}
dt {
  font-weight: bold;
  margin-top: 0.5rem;
}
dd {
  margin: 0 0 0.5rem 0;
  font-family: ui-monospace, monospace;
}
</style>
