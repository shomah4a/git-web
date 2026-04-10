# ビュー間タブナビゲーション追加

## セッション概要

### 実装内容

- **ADR 0024** を新設し、ビュー間タブナビゲーションの設計を定めた
- **App.vue** に全ページ共通のタブナビゲーションを追加
  - Worktree (`/`)、Diff (`/diff`)、Revision (`/tree?rev=HEAD`) の3タブ
  - `/` の router-link は `active-class=""` + `exact-active-class` で正確なアクティブ判定
  - 既存の CSS 変数でテーマ対応を維持
- **テスト修正** (以前から壊れていたテストを含む)
  - `mountWithHighlighter` にテスト用 memory-history router の自動注入を追加
  - `App.test.ts` の DiffView テストを WorktreeView 用に修正
  - `DiffView.test.ts` の ADR 0020 URL query 同期テスト4件を Vue Router 経由に修正
  - 全148テスト通過

### ブランチ

`feature/view-tab-navigation` (2 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。MEDIUM 1件 (Revision タブのリンク先が常に `/tree?rev=HEAD` 固定、仕様範囲内)。LOW 1件 (対応済み)。

## TODO

- [ ] main への merge (ユーザー判断)
