# 0039. blob 表示のクロームレスモード

## ステータス

承認済み (2026-04-15)

## コンテキスト

Markdown ファイルのレンダリング結果を PDF 化したい場合、App.vue のグローバルヘッダー（タイトル、リポジトリ情報、ビュータブ、パンくずリスト）が出力に含まれてしまい、コンテンツだけを取得できない。

## 決定

### クエリパラメータ方式

`chromeless=1` クエリパラメータを付与することで、App.vue のヘッダーを非表示にする。

- `/blob?rev=HEAD&path=README.md&chromeless=1`
- `/wt/blob?path=README.md&chromeless=1`

### 適用範囲

chromeless モードはルート名が `blob` または `worktree-blob` の場合にのみ有効とする。他の画面に遷移した場合はヘッダーが通常どおり表示される。

### 実装方針

- App.vue のヘッダーを `v-show` で制御する（`v-if` ではない。Teleport のターゲット `#page-header-slot` を DOM に維持するため）
- BlobView / WorktreeBlobView にトグルボタンを配置し、`router.push` でクエリパラメータを付け外しする（[ADR 0031](./0031-tree-view-browser-history.md) と同じ方針。`replace` ではブラウザバックで戻れなくなるため）
- chromeless 状態の読み書きロジックは `useChromeless` composable として共通化する
- chromeless 時は `.blob-view` の `max-width` 制限を解除する

### provide/inject は使用しない

各コンポーネントが `route.query` を直接参照すれば十分であり、新たな結合を導入しない。

## 影響

- App.vue に `v-show` 条件を追加するが、chromeless 未指定時の挙動は変更しない
- BlobView / WorktreeBlobView にトグルボタンの UI を追加
- `--header-height` CSS 変数はヘッダー非表示時に 0px になるが、BlobView と DiffView は排他的に表示されるため実害なし
