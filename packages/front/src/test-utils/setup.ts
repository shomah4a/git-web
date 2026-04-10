/**
 * Vitest セットアップ (ADR 0021)。
 *
 * jsdom は `window.matchMedia` を実装していないため、
 * `App.vue` が `createMatchMediaSystemWatcher(window.matchMedia(...))` を
 * 呼ぶと TypeError になる。テスト上は prefers-color-scheme を常に
 * light として扱えば十分なので、最小限のスタブを差し込む。
 *
 * 本体コードは `PrefersColorSchemeQuery` という狭い port を受け取る
 * 設計なので、ここで生やす matchMedia は `matches: false` と
 * `addEventListener` / `removeEventListener` の no-op 実装のみで足りる。
 */

/**
 * `Object.defineProperty` の PropertyDescriptor.value は `any` なので、
 * ここでは関数オブジェクトの型を厳密に MediaQueryList と合わせる必要は
 * ない (`as MediaQueryList` を書かずに済む)。
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }),
  })
}
