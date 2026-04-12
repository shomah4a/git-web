# ADR 0031: ツリー表示のブラウザ履歴管理を push に変更する

## ステータス

提案

## コンテキスト

[ADR 0022](./0022-tree-view-and-routing.md) で導入された RevisionTreeView の URL 同期処理 (`syncUrl()`) は `router.replace()` を使用している。
`replace()` はブラウザ履歴を上書きするため、ディレクトリ移動後にブラウザバックすると直前のツリー表示ではなくトップページに戻ってしまう。

**再現手順:**

1. `/` からリビジョンタブをクリックして `/tree?rev=HEAD` に遷移
2. ツリー内のディレクトリをクリック → `syncUrl()` が `router.replace()` で URL を `/tree?rev=HEAD&path=src` に置換
3. 履歴スタックは `[/, /tree?rev=HEAD&path=src]` となり、`/tree?rev=HEAD` が消失
4. ブラウザバック → `/` に戻る（期待: `/tree?rev=HEAD`）

## 決定

`syncUrl()` 内の `router.replace()` を `router.push()` に変更する。

URL（クエリストリングを含む）が変わるナビゲーションはすべて履歴に積む。
Vue Router は同一 URL への `push()` を無視するため、重複エントリの問題は発生しない。

既存の `watch(route.query)` による back/forward 追従ロジックはそのまま活用する。

## 影響範囲

同じ `router.replace()` パターンが以下のコンポーネントにも存在するため、同時に修正する。

- `RevisionTreeView.vue` — `syncUrl()`
- `WorktreeView.vue` — `syncUrl()`
- `DiffView.vue` — `syncUrlFromState()`

## 帰結

- ディレクトリ移動・リビジョン変更・diff range 変更のたびにブラウザ履歴が積まれ、back/forward で遷移できるようになる
- 各コンポーネントの `syncUrl` / `syncUrlFromState` 内の `router.replace()` を `router.push()` に変更するのみで完結する
