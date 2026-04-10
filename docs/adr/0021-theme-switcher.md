# 0021. テーマスイッチャ (Light / Dark / Auto) と Shiki マルチテーマ化

## ステータス

承認済み

## 文脈

git-web はライトテーマ固定で運用してきたが、以下の要求が出た:

- ユーザーが Light / Dark / Auto の 3 値を選べるようにしたい
- Auto は OS の `prefers-color-scheme` に追従する
- 選択状態は永続化したい

前提条件:

- git-web はクライアント完結 (CSR 前提) で SSR は無い
- フロントは Vue 3 + Vite、コンポーネントスコープ CSS
- シンタックスハイライトに Shiki を利用している (ADR 0017)。ADR 0017 は `github-light` 単一テーマ前提で設計されている

以下の設計上の論点を本 ADR で決定する。

- 永続化ストレージの選定 (localStorage vs cookie)
- テーマパレットの表現方法 (CSS Custom Properties vs SCSS 変数)
- Shiki のマルチテーマ化戦略
- FOUC (Flash of Unstyled Content) 防止
- Auto モードの実装戦略

## 決定

### 1. 永続化は localStorage

保存先は `localStorage`、キーは `git-web:theme`、値は `'light' | 'dark' | 'auto'` の 3 値。

理由:

- git-web は SSR を行わないため、サーバー側でテーマ情報を読む必要がない
- cookie を選ぶと全 HTTP リクエストに載ることになり、API レスポンスに関与しない情報を毎回送ることになる (無駄)
- `localStorage` は同期 API であり、後述の FOUC 防止スクリプトで初期描画前にテーマを決定できる

定数は `packages/front/src/theme/theme-store.ts` に `export const THEME_STORAGE_KEY = 'git-web:theme'` として置き、`index.html` の FOUC ガードスクリプトと値が drift しないよう双方向にコメントで相互参照する。

### 2. パレットは CSS Custom Properties、SCSS は導入しない

カラートークンは `packages/front/src/styles/theme.css` に CSS Custom Properties として定義し、`:root[data-theme='light']` / `:root[data-theme='dark']` でパレット全体を差し替える。

SCSS を導入しない理由:

- SCSS の `$variable` はビルド時に固定値に展開されるため、ランタイムでのテーマ切替には使えない
- ランタイム切替が必要な以上、どちらにせよ CSS Custom Properties が必須
- scoped CSS により SCSS のネストや mixin の需要は小さい
- 依存追加は supply chain 観点で必要最小限にする方針 (`.claude/rules/package-management.md`)

ライトパレットは既存のハードコード色をそのまま変数に移し、変数化前後で見た目が変わらないことを最優先する。ダークパレットは GitHub Dark の系統に寄せ、Shiki `github-dark` テーマとの前景色コントラストを整える。

### 3. Shiki をマルチテーマ化する (ADR 0017 の補訂)

ADR 0017 で決定した `THEME = 'github-light'` 固定を撤廃し、以下に変更する:

- `getSingletonHighlighter({ themes: ['github-light', 'github-dark'], langs: [] })` で両テーマをロード
- `inst.codeToTokensWithThemes(content, { themes: { light: 'github-light', dark: 'github-dark' }, lang })` を使用
- 戻り値 `ThemedTokenWithVariants[][]` の各 token は `variants: Record<string, { color?: string; ... }>` を持つ
- `variants['light']?.color` と `variants['dark']?.color` をそれぞれ `normalizeColor` (6/8 桁 hex ホワイトリスト) に通して `HighlightedToken.color` / `HighlightedToken.colorDark` に格納する

`HighlightedToken` 型の変更は **後方互換拡張** とし、既存の `color` フィールドをライト側の色として温存したうえで `colorDark: string | null` を追加する。これにより `DiffView.test.ts` の既存 fixture (`{ content, color }` 形) の破壊的変更を回避する。

`createNoOpHighlighter` は `colorDark: null` を埋めるだけで振る舞いは変えない。

### 4. DiffView のトークン描画は CSS 変数で切替 (再計算を回避)

トークンの色切替をテーマ変更のたびに再計算すると大規模 diff でコストが大きいため、DiffView は `<span>` 1 つに 2 色を CSS Custom Properties として埋め込み、`:root[data-theme]` で切り替える方式を採る。

```vue
<span
  class="shiki-tok"
  :style="{
    '--shiki-l': tok.color ?? 'inherit',
    '--shiki-d': tok.colorDark ?? 'inherit',
  }"
>{{ tok.content }}</span>
```

対応するルールは **グローバル** CSS (`theme.css`) に置く:

```css
.shiki-tok {
  color: var(--shiki-l, inherit);
}
:root[data-theme='dark'] .shiki-tok {
  color: var(--shiki-d, inherit);
}
```

DiffView の `<style scoped>` 内には `.shiki-tok` のルールを書かない。scoped CSS は `[data-v-xxx]` 属性スコープを付けるため、`:root[data-theme='dark']` との組合せが壊れる (セレクタ特異度の問題ではなく、scoped transform 後に `:root[data-theme='dark'] .shiki-tok[data-v-xxx]` となり意図通り動くが、メンテナンス性のため global 側に集約する)。

この方式の副作用として、DiffView の DOM は各トークンに 2 色分の style 属性を保持する (従来比で色情報が約 2 倍)。実測上の UI 影響は無視できる範囲と判断するが、将来的に巨大 diff で問題化した場合は再検討する。

### 5. ThemeSwitcher の UI

App.vue のヘッダ右上に `ThemeSwitcher.vue` を配置する。3 値を横並びのボタングループで表現する:

- `<button type="button" aria-pressed="...">` 3 つのグループ
- `role="radiogroup"` / `role="radio"` は **使わない**。WAI-ARIA radio group を名乗る場合は矢印キー操作が期待されるが、本実装では Tab 操作のみサポートしたいため、role を外してセマンティクスの齟齬を避ける
- 選択状態は `aria-pressed="true"` で表現する (toggle button 3 つの独立 toggle 的なセマンティクスになるが、ボタン 1 つだけが pressed=true になる運用で問題ない)
- アイコンは付けず、テキストラベル `ライト` / `ダーク` / `自動` のみ

### 6. Auto モードと FOUC 防止

Auto は `matchMedia('(prefers-color-scheme: dark)')` で OS 設定を読む。ユーザーが `'auto'` を選んでいる場合だけ system 値で resolved theme を決定し、`'light'` / `'dark'` を選んでいる場合は system 値を無視する。

`matchMedia` の購読は `theme === 'auto'` でなくても常時有効とし、resolved 計算のタイミングで条件分岐する。購読と解除を theme 値に応じて動的に切替える設計より、ライフサイクルが単純になり unsubscribe 漏れのリスクが低い。

FOUC 防止のため、`index.html` の `<head>` に以下の同期 inline script を置く (Vue の起動前に動く):

```html
<script>
  ;(function () {
    try {
      var t = localStorage.getItem('git-web:theme')
      var resolved =
        t === 'light' || t === 'dark'
          ? t
          : matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
      document.documentElement.setAttribute('data-theme', resolved)
    } catch (e) {}
  })()
</script>
```

- `try/catch` で localStorage 禁止環境 / `matchMedia` 未対応環境を吸収
- `defer` / `async` は付けない (`<head>` の同期実行が必須)
- キー名 `'git-web:theme'` は `theme-store.ts` の `THEME_STORAGE_KEY` と一致させる (コメントで相互参照)

将来 CSP (Content Security Policy) を導入する場合、本スクリプトは nonce 化が必要になる。

### 7. 副作用の外部化

`theme-store.ts` は `localStorage` と `matchMedia` に直接依存せず、以下の port 経由で注入する (`.claude/rules/070-coding-rules.md`):

```ts
export type ThemeStorage = {
  load(): Theme
  save(theme: Theme): void
}

export type SystemThemeWatcher = {
  current(): ResolvedTheme
  subscribe(cb: (theme: ResolvedTheme) => void): () => void
}
```

本番は `createLocalStorageThemeStorage()` / `createMatchMediaSystemWatcher()` で組み立て、テストは fake 実装を渡すことで副作用を切り離す。

## 帰結

- アプリのカラーは CSS Custom Properties 経由となり、今後の微調整がパレット定義 1 箇所で可能になる
- Shiki のトークン色はテーマ切替で再計算されず、`[data-theme]` 属性の書き換えだけでダーク / ライトが切り替わる
- DiffView の DOM サイズは各トークンに 2 色分の `--shiki-l` / `--shiki-d` 属性値を保持するため、従来比で色情報が約 2 倍になる
- `HighlightedToken` の型は後方互換拡張のため、ADR 0017 当時のテストコードは修正最小限で通る
- FOUC 防止のインラインスクリプトにより、リロード直後のテーマちらつきが発生しない
- ADR 0017 (Shiki シングルテーマ前提) は本 ADR で上書きされる。ADR 0017 の context に本 ADR へのリンクを追記する

### 非ゴール

- テーマの微調整 (アクセントカラー等)
- high-contrast / sepia 等の追加テーマ
- SSR 対応
- cookie への保存
- ThemeSwitcher の矢印キー / ショートカット操作

## 関連 ADR

- 0004: frontend-vue3
- 0010: 型安全 (`as` 禁止、InjectionKey 運用)
- 0017: Shiki シンタックスハイライト (本 ADR でマルチテーマ化される)
