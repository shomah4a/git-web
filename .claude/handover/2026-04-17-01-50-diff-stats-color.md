# diff stats の色付け

## セッション概要

- diff ページの追加行数・削除行数の表示に色を付けた
- ブランチ: `feat/diff-stats-color`
- ADR 0043 として設計決定を記録

### 変更内容

1. `theme.css` に `--color-stat-addition` / `--color-stat-deletion` をライト・ダーク両テーマに追加（値は既存変数 `--color-status-added` / `--color-error-strong` への参照）
2. `DiffView.vue` のサイドバーファイル一覧とファイルヘッダーの2箇所で、additions を緑、deletions を赤で統一して色付け
3. 実装安全性評価: 重大な問題なし、リリース可

## TODO

- main へのマージ
