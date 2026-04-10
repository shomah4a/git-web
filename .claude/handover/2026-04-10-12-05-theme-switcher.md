# テーマスイッチャ (Light / Dark / Auto) 実装

## セッション概要

ライト / ダーク / 自動の 3 値テーマ切替機能を実装した。

### 実装内容

- **ADR 0021** を新設し、テーマ切替 + Shiki マルチテーマ化の設計を定めた
- **theme-store.ts**: `resolveTheme` 純粋関数、`useTheme` Vue composable、`ThemeStorage` / `SystemThemeWatcher` の port 型 + 本番 factory。副作用外部化ルール準拠
- **theme.css**: CSS Custom Properties で 20 種程度のカラートークンを定義。`:root[data-theme='light']` / `:root[data-theme='dark']` でパレット切替。`.shiki-tok` の light/dark 色切替ルールもグローバルに定義
- **FOUC ガード**: `index.html` にインラインスクリプトを追加し、Vue 起動前に `<html data-theme>` を確定
- **カラー変数化**: App.vue / RevisionCombobox.vue / DiffView.vue のハードコードカラーを CSS 変数に置換 (ライト値は既存色をそのまま移行、視覚差ゼロ)
- **ThemeSwitcher.vue**: `<button aria-pressed>` 3 つのグループ。App.vue ヘッダ右上に配置
- **Shiki マルチテーマ化**: `codeToTokensWithThemes` で github-light / github-dark 両テーマのトークンを取得。`HighlightedToken` に `colorDark` を optional で後方互換追加。DiffView は `--shiki-l` / `--shiki-d` CSS 変数を各 `<span>` に埋め込み、テーマ切替時にトークン再計算不要
- **追加修正**: ダークモードで input / apply ボタン / options が白背景のまま浮く問題を修正

### ブランチ

`feature/theme-switcher` (13 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。LOW 4 件 (リリース阻害要因なし)。

## TODO

- [ ] main への merge (ユーザー判断)
- [ ] SVG data URI 内の stroke 色 (`%23888`) はテーマ非追従のまま。ダーク時にルーペアイコンが若干見えにくい可能性あり (対応優先度低)
- [ ] 実装安全性評価 LOW-1: index.html と theme-store.ts のキー名二重管理に対し、スモークテストで機械的 drift 検知を入れる案がある (任意)
- [ ] 実装安全性評価 LOW-2: no-op highlighter で `colorDark: null` を明示する (任意)
