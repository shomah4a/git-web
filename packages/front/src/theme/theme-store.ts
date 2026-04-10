/**
 * テーマ切替ストア (ADR 0021)。
 *
 * 設計方針:
 * - localStorage と matchMedia への副作用は本モジュールの factory 関数群
 *   (`createLocalStorageThemeStorage` / `createMatchMediaSystemWatcher`) に集約
 *   し、ストア本体は port (`ThemeStorage` / `SystemThemeWatcher`) 経由で
 *   テスト可能にする (ルール 070 副作用の外部化)
 * - `resolveTheme` は純粋関数として単独テスト可能
 * - watcher は常時購読し、resolved 計算時に `theme === 'auto'` のときだけ
 *   system 値を反映する。購読開始/停止を theme 値に応じて動的に切替える
 *   設計よりライフサイクルが単純になる
 */

import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'

export type Theme = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

/**
 * localStorage のキー名。
 *
 * NOTE: この値は `packages/front/index.html` の FOUC ガードインライン script
 * 内の `localStorage.getItem('git-web:theme')` と一致させること。
 * 片方だけ変更すると初期描画のテーマが ref の値とずれる。
 */
export const THEME_STORAGE_KEY = 'git-web:theme'

/**
 * テーマ永続化の port。
 * - load(): 保存値が無い / 壊れている場合は `'auto'` に倒す
 * - save(theme): 書き込み失敗は silent (localStorage 禁止環境向け)
 */
export type ThemeStorage = {
  load(): Theme
  save(theme: Theme): void
}

/**
 * OS のカラースキームを監視する port。
 * - current(): 現在値
 * - subscribe(cb): 変更通知を購読し、解除関数を返す
 */
export type SystemThemeWatcher = {
  current(): ResolvedTheme
  subscribe(cb: (theme: ResolvedTheme) => void): () => void
}

/**
 * ユーザー選択テーマとシステムテーマから resolved を求める純粋関数。
 */
export function resolveTheme(theme: Theme, system: ResolvedTheme): ResolvedTheme {
  return theme === 'auto' ? system : theme
}

/**
 * テーマストアの公開インターフェイス。
 */
export type ThemeStore = {
  readonly theme: Ref<Theme>
  readonly resolved: ComputedRef<ResolvedTheme>
  setTheme(theme: Theme): void
}

/**
 * Vue composable。Vue setup の中から呼び出す。
 * onUnmounted で watcher を自動解除する。
 */
export function useTheme(storage: ThemeStorage, watcher: SystemThemeWatcher): ThemeStore {
  const theme = ref<Theme>(storage.load())
  const system = ref<ResolvedTheme>(watcher.current())

  const unsubscribe = watcher.subscribe((next) => {
    system.value = next
  })
  onUnmounted(unsubscribe)

  const resolved = computed(() => resolveTheme(theme.value, system.value))

  // 書き込み系は setTheme に集約する (setTheme 以外で theme.value を直接書き
  // 換える運用も許容するため、watch でも永続化を行う)
  watch(theme, (next) => {
    storage.save(next)
  })

  function setTheme(next: Theme): void {
    theme.value = next
  }

  return { theme, resolved, setTheme }
}

/**
 * localStorage を直接触る本番用 ThemeStorage。
 * load() は値の型ガードを行い、未知値は `'auto'` に倒す。
 * save() / load() の例外は silent に握りつぶす (プライベートブラウジング等)。
 */
export function createLocalStorageThemeStorage(storage: Storage): ThemeStorage {
  return {
    load(): Theme {
      try {
        const raw = storage.getItem(THEME_STORAGE_KEY)
        return isTheme(raw) ? raw : 'auto'
      } catch {
        return 'auto'
      }
    },
    save(theme: Theme): void {
      try {
        storage.setItem(THEME_STORAGE_KEY, theme)
      } catch {
        // no-op
      }
    },
  }
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/**
 * `matchMedia('(prefers-color-scheme: dark)')` を直接触る本番用 watcher が
 * 依存する最小 API。`MediaQueryList` はこの型を構造的に満たす。
 *
 * 本ファイルは DOM 型 `MediaQueryList` 全体ではなく、実際に使う
 * `matches` と `change` イベント関連のみを port として持つ。これは
 * ADR 0010 (`as` 禁止) のもとでもテスト fake が最小実装で通るようにする
 * ためで、MediaQueryList のすべてのメンバをスタブする必要がない。
 */
export type PrefersColorSchemeQuery = {
  readonly matches: boolean
  addEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void
  removeEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void
}

/**
 * `matchMedia('(prefers-color-scheme: dark)')` を直接触る本番用 watcher。
 * subscribe は `addEventListener('change', ...)` を用い、解除関数は
 * `removeEventListener` を呼ぶ。
 */
export function createMatchMediaSystemWatcher(
  mql: PrefersColorSchemeQuery,
): SystemThemeWatcher {
  return {
    current(): ResolvedTheme {
      return mql.matches ? 'dark' : 'light'
    },
    subscribe(cb: (theme: ResolvedTheme) => void): () => void {
      const listener = (e: { matches: boolean }): void => {
        cb(e.matches ? 'dark' : 'light')
      }
      mql.addEventListener('change', listener)
      return () => {
        mql.removeEventListener('change', listener)
      }
    },
  }
}
