# 0042. コンテンツのセンタリング

## ステータス

承認済み (2026-04-16)

## コンテキスト

画面幅が広い環境（ワイドモニタ等）ではコンテンツが左寄せのまま横に広がり、可読性が低下する。
GitHub のようにコンテンツを中央寄せにし、最大幅を制限することで視認性を改善したい。

## 決定

### レイアウト構造

- ヘッダー（タイトル・テーマ切替・タブ）は全幅を維持する
- `router-view` を `.content-area` で囲み、`max-width: 1280px` と `margin: 0 auto` でセンタリングする
- diff ルートは横幅を最大限使いたいため `.content-area` クラスを適用しない
- `padding: 0 1rem` は `main` に維持し、狭い画面での余白を確保する

### 子コンポーネントの幅制限の廃止

各ビューコンポーネントが個別に持っていた `max-width: 900px` を削除し、幅制限は `.content-area` に一元化した。
これに伴い `blob-view--chromeless` クラス（`max-width: none` のためだけに存在していた）も不要となり削除した。

### 対象コンポーネント

- WorktreeView: `max-width: 900px` 削除
- RevisionTreeView: `max-width: 900px` 削除
- BlobView: `max-width: 900px` / `blob-view--chromeless` 削除
- WorktreeBlobView: `max-width: 900px` / `blob-view--chromeless` 削除

## 影響

- 1280px 以下の画面では表示に変化なし
- chromeless モード（ADR 0039）のヘッダー非表示機能には影響なし（App.vue 側の `isChromeless` で制御）
