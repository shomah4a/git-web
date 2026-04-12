# ブラウザバック修正 (URL 同期の replace → push)

## セッション概要

### 実装内容

- **ADR 0031** を新設し、URL 同期処理の `router.replace()` → `router.push()` 変更方針を記録
- `RevisionTreeView.vue`, `WorktreeView.vue`, `DiffView.vue` の 3 コンポーネントで `router.replace()` を `router.push()` に変更
- ADR 0022 に ADR 0031 への逆リンクを追記

### ブランチ

`fix/browser-back-revision-tree`

### 変更ファイル

- `docs/adr/0031-tree-view-browser-history.md` — ADR 新設
- `docs/adr/0022-tree-view-and-routing.md` — 逆リンク追記
- `packages/front/src/components/RevisionTreeView.vue` — `syncUrl()` の replace → push
- `packages/front/src/components/WorktreeView.vue` — `syncUrl()` の replace → push
- `packages/front/src/components/DiffView.vue` — `syncUrlFromState()` の replace → push、コメント修正

### 実装安全性評価結果

- HIGH/CRITICAL: なし
- LOW-1: ADR 0022 への逆リンク未記載 → 修正済み

## TODO

- なし
