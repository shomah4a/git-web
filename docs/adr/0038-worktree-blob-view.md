# 0038. worktree 画面にファイルビューを追加する

## ステータス

承認済み (2026-04-14)

## コンテキスト

revision 画面 (`/tree`) ではファイルをクリックすると `/blob?rev=<rev>&path=<path>` に遷移してファイル内容を表示できる。一方、worktree 画面 (`/`) ではファイルはクリック不可で内容を確認できなかった。

## 決定

### ルーティング

worktree 用の blob 表示ルートを `/wt/blob?path=<path>` として新設する。revision 用の `/blob` とは別ルートとする。

- `/blob?rev=<rev>&path=<path>` — revision 用（既存、変更なし）
- `/wt/blob?path=<path>` — worktree 用（新規、rev パラメータなし）

### コンポーネント構成

BlobView.vue からファイル表示のコアロジック（シンタックスハイライト、Markdown レンダリング、画像表示、バイナリ判定）を `BlobContent.vue` として切り出す。

- `BlobContent.vue` — blob 表示の共有コンポーネント（props 経由でデータを受け取る）
- `BlobView.vue` — revision 用。`/blob` ルート。rev 付きで blob API を呼び、BlobContent を表示
- `WorktreeBlobView.vue` — worktree 用。`/wt/blob` ルート。rev なしで blob API を呼び、BlobContent を表示

### ナビゲーション

- WorktreeView でファイルクリック → `/wt/blob?path=<path>` へ遷移
- WorktreeBlobView のパンくず → `/`（worktree ツリー）へ戻る
- BlobView のパンくず → `/tree`（revision ツリー）へ戻る（既存動作、変更なし）

### API

バックエンド変更は不要。`/api/blob` は既に `rev` パラメータなしで worktree の blob を返す。

## 影響

- BlobView.vue をリファクタリングするが、既存の `/blob` ルートの挙動は変更しない
- WorktreeView.vue にファイルクリック時のナビゲーションを追加
