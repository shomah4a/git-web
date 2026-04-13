# ADR 0033: セマンティックヘッダの定義とスクロール固定

## ステータス

承認済み

## コンテキスト

各画面にはヘッダ相当の操作要素がある（Worktree のパンくず、Diff の from/to セレクタ、Revision のリビジョンセレクタ + パンくず）。
これらはコンテンツをスクロールすると画面外に消えてしまい、操作性が低い。

また、repository / HEAD 情報は `<dl>` で縦に並んでおり、スペースを取りすぎている。

## 決定

### ヘッダ構造

- App.vue にセマンティックな `<header>` を定義し、`position: sticky; top: 0` で画面上部に固定する
- ヘッダ内に各ページ固有のコントロールを挿入するためのターゲット要素を配置する
- 各ビューコンポーネントは Vue の `<Teleport>` を使ってヘッダ内にコントロールを送る

### ヘッダの内容

1. タイトル + repository / HEAD 情報 + テーマスイッチャー（横一列）
2. ビュータブ（Worktree / Diff / Revision）
3. 各ページ固有のコントロール（Teleport で挿入）

### repository / HEAD 情報

- `<dl>` のまま `display: flex` で横並びにし、アクセシビリティを維持する
- HEAD のコミットハッシュはショート表示に変更する（`git rev-parse --short HEAD`）

### DiffView の対応

- `<header class="rev-selector">` は `<div>` に変更し、App.vue の `<header>` との二重ネストを回避する
- `.file-list` の `position: sticky; top: 0` はヘッダ高さ分を CSS 変数で調整する

### sticky ヘッダの制約

- `overflow: visible` を維持し、RevisionCombobox のドロップダウンがクリップされないようにする
- ヘッダの高さを CSS 変数 `--header-height` として公開し、他の sticky 要素が参照できるようにする

## 影響

- App.vue、WorktreeView.vue、DiffView.vue、RevisionTreeView.vue、BlobView.vue のテンプレート構造が変わる
- テストでは Teleport ターゲット要素の準備が必要になる
- API 側は `git rev-parse --short HEAD` に変更
