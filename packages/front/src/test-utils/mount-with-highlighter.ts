/**
 * Highlighter を注入した状態で Vue コンポーネントを mount するテストヘルパ
 * (ADR 0017)。
 *
 * 目的:
 * - `InjectionKey<Highlighter>` (Symbol) を `global.provide` に渡すときの
 *   型キャスト問題をヘルパ 1 箇所に閉じ込める
 * - ADR 0010 の `as` 禁止を守りつつ、テスト側で eslint-disable に流れない
 *   ための回避策を提供する
 *
 * 実装方針:
 * - Vue Test Utils の `mount` の `global.provide` はプレーンオブジェクトを
 *   受ける。JavaScript では Symbol を object のキーとして直接書けるので、
 *   `{ [highlighterKey]: highlighter }` のオブジェクトリテラルで渡せる
 * - Vue Test Utils の型定義上 `provide` は `Record<string, unknown>` 相当を
 *   期待するが、Vue 本体の inject は Symbol キーも問題なく解決するため、
 *   ランタイムには無害。型は `GlobalMountOptions['provide']` の型制約を
 *   満たすよう 1 箇所だけ satisfies で narrow する
 */

import { type ComponentMountingOptions, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import type { Plugin } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import { type Highlighter, highlighterKey } from '../diff/highlighter/types.js'

/**
 * テスト用のダミー router を生成する。DiffView 等 useRoute / useRouter を
 * 呼ぶコンポーネントをマウントする際に global.plugins へ注入する。
 */
function createTestRouter(): Plugin {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
}

/**
 * `mount` に `highlighterKey` で Highlighter を inject した状態でコンポーネントを
 * マウントする。`highlighter` を省略した場合は no-op が注入される。
 *
 * 既存の `mount(Comp)` / `mount(Comp, { attachTo: ... })` を
 * `mountWithHighlighter(Comp)` / `mountWithHighlighter(Comp, undefined, { attachTo: ... })`
 * に置き換えるだけで使える。
 */
// 戻り値型は Vue Test Utils の mount オーバーロード解決に任せる。
// `ReturnType<typeof mount<TComponent>>` で明示すると VueWrapper の
// ジェネリック展開が単一シグネチャに落ち、オーバーロード解決時の
// 実戻り値型と噛み合わないため明示しない。eslint の
// explicit-function-return-type は本プロジェクトでは有効になっていない。
export function mountWithHighlighter<TComponent extends Component>(
  component: TComponent,
  highlighter: Highlighter = createNoOpHighlighter(),
  options: ComponentMountingOptions<TComponent> = {},
) {
  ensureTeleportTarget()
  // provide の型は `Record<string | symbol, unknown>` 相当だが、Vue Test Utils
  // の d.ts は string キーだけを想定しているケースがある。Symbol キーを含む
  // オブジェクトを安全に渡すため、provide マージだけを build 関数に閉じ込める。
  const provide = buildProvide(highlighter, options.global?.provide)
  const existingPlugins = options.global?.plugins ?? []
  // 呼び出し側が plugins を指定していればそちらを優先し、
  // 未指定の場合のみデフォルトの memory-history router を注入する。
  const plugins = existingPlugins.length > 0 ? existingPlugins : [createTestRouter()]
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins,
      provide,
      stubs: {
        teleport: true,
        ...options.global?.stubs,
      },
    },
  })
}

/**
 * Teleport ターゲット (#page-header-slot) がテスト DOM に存在しない場合に
 * 作成する。ADR 0033 で各ビューコンポーネントが Teleport を使うようになった
 * ため、テスト環境でもターゲット要素が必要。
 */
function ensureTeleportTarget(): void {
  if (document.getElementById('page-header-slot') === null) {
    const el = document.createElement('div')
    el.id = 'page-header-slot'
    document.body.appendChild(el)
  }
}

/**
 * 既存の `global.provide` (もし呼び出し側が指定していれば) と
 * `{ [highlighterKey]: highlighter }` をマージする。
 *
 * `provide` は Vue Test Utils の型上 `Record<string, unknown>` または undefined
 * を受ける可能性があるが、ランタイムでは Symbol キーも問題なく扱われる。
 * プロパティアクセス / スプレッドは Symbol キーを維持する。
 */
function buildProvide(
  highlighter: Highlighter,
  existing: Record<string | symbol, unknown> | undefined,
): Record<string | symbol, unknown> {
  return {
    ...(existing ?? {}),
    [highlighterKey]: highlighter,
  }
}
