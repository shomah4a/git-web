# GitHub 風サイズ調整

## セッション概要

### 実装内容

- **ADR 0027** を新設し、diff/ファイル一覧のフォントファミリ・サイズ・行間を GitHub Primer 準拠に調整する方針を定めた
- **theme.css**: `--font-mono` CSS 変数を追加 (`ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace`)
- **全コンポーネント**: `font-family: ui-monospace, monospace` → `font-family: var(--font-mono)` に統一
  - DiffView.vue, RevisionCombobox.vue, RevisionTreeView.vue, WorktreeView.vue, App.vue
- **DiffView.vue サイズ調整**:
  - `.file-body` font-size: `0.9em` → `0.75rem` (= 12px)
  - `.row` line-height: `1.4` → `1.667` (= 20px at 12px)
  - `.row` min-height: `1.4em` → `1.667em`
  - `.row-lineno` width: `3em` → `4em`, padding: `0 0.5em` → `0 10px`
  - `.code-row` line-height: `1.4` → `1.667`
  - `.code-row .row-lineno` flex: `0 0 4rem` → `0 0 4em`

### ブランチ

`feature/github-style-sizing` (1 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。LOW 3 件 (App.vue の main が sans-serif のまま、--font-mono がダークテーマ未記載、0.75rem が小さめ) → いずれも対応不要と判断。

## TODO

- [ ] main への merge (ユーザー判断)
