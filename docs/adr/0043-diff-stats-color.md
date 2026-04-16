# ADR 0043: diff stats の追加行数・削除行数に色を付ける

## ステータス

承認

## コンテキスト

diff ページのファイル一覧およびファイルヘッダーに表示される `+additions/-deletions` の数値は、
現状 `--color-fg-subtle` (グレー系) で統一表示されており、追加と削除の視覚的な区別がない。

## 決定

- 追加行数を緑系、削除行数を赤系で色付けする
- CSS カスタムプロパティとして `--color-stat-addition` / `--color-stat-deletion` を新設する
- 値は既存の意味論的変数への参照とし、カラーコードの直書きを避ける
  - `--color-stat-addition: var(--color-status-added)`
  - `--color-stat-deletion: var(--color-error-strong)`
- DiffView.vue 内の 2 箇所（サイドバーのファイル一覧、各ファイルのヘッダー）で統一して適用する

## 根拠

- 意味論的な変数を介することで、将来 stats 固有の色調整が必要になった場合にテーマ定義の変更のみで対応できる
- 既存変数への参照とすることで、カラーコードの重複管理を避ける
