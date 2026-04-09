# diff from/to と URL query 同期 完了申し送り

## セッション概要

ADR 0019 で導入した diff ビューの from/to セレクタは選択しても URL に反映されず、リロードで初期値に戻っていた。本セッションでは URL query との双方向同期と History API (pushState + popstate) 連動を実装した。

対象ブランチ: `feature/diff-url-query-sync` (未マージ、未プッシュ)

## 主要成果

### 1. ADR 0020 起票

`docs/adr/0020-diff-url-query-sync.md`

- クエリキーは API と同じ `from` / `to`
- `from=HEAD` / `to=(worktree)` はデフォルトとしてキー省略 (既存 URL 互換維持)
- `pushState` で履歴を積み、`popstate` で戻る/進むに追従
- 副作用は `url-state.ts` に外部化
- `runDiffLoad` の契約 (ADR 0019) は不変

### 2. `packages/front/src/url-state.ts` 新規

純粋関数 + `window` 直接参照を避ける構造的 narrow 型:

- `readDiffRangeFromSearch(search)`
- `buildDiffRangeSearch(range)`
- `pushDiffRangeToUrl(history, location, range)`
- `HistoryPusher` / `LocationView` 型 (type assertion 禁止ルール対応)
- `WORKTREE_SENTINEL` / `DEFAULT_FROM` / `DEFAULT_TO` の定数を export

テスト 20 ケース (LOW 対応ケース含む)

### 3. `packages/front/src/components/DiffView.vue` 改修

- `readDiffRangeFromSearch(window.location.search)` で `fromRev` / `toRev` を初期化
- `syncUrlFromState()` を `onRevSubmit` / `onApply` で発火
- `onMounted` で `popstate` listener 登録、`onBeforeUnmount` で解除
- `onPopState` は同一 range のとき early return (LOW-3)
- 既存の `WORKTREE_SENTINEL` ローカル定義を削除し `url-state.js` から import 共有

### 4. `packages/front/src/components/RevisionCombobox.vue` 改修

- `WORKTREE_SENTINEL` を `url-state.js` から import 共有 (MEDIUM-1)

### 5. DiffView テスト追加 (計 6 ケース)

- URL 初期復元 (from/to 両方指定 / from のみ / 適用ボタンで pushState / 候補クリックで pushState)
- popstate で range 同期
- popstate 同一 range の early return
- デフォルト状態で URL 空維持

## テスト / チェック

- `./bin/pnpm check` 通過
  - api 305 tests / front 129 tests / common 6 tests
  - lint / format:check / build / typecheck / test すべて通過

## 実装安全性評価

`.claude/tmp/2026-04-09_diff-url-query-sync-impl-review.md`

初回評価: CRITICAL 0 / HIGH 0 / MEDIUM 1 / LOW 4

本セッション内で対応済み:

- MEDIUM-1: `WORKTREE_SENTINEL` の三重定義解消 (url-state.ts を単一の真実に)
- LOW-1: `URLSearchParams` の `+` → space 変換対策 (`%2B` 事前置換)
- LOW-2: URL 手入力 `?from=(worktree)` の正規化 (DEFAULT_FROM に倒す)
- LOW-3: `onPopState` の同一 range early return

未対応 (スコープ外):

- LOW-4: SSR 時の window 参照回避 → 評価者自身も「過剰設計の可能性」と明示。SSR 化の具体計画が出た時点で `createDiffUrlBinding` factory 化を再検討

## コミット履歴 (feature/diff-url-query-sync)

```
cf82923 LOW-1/2/3 を対応する
d538e43 WORKTREE_SENTINEL を url-state から import 共有する (MEDIUM-1)
77aaf26 type assertion 禁止ルールに沿って url-state の型を構造的 narrow にする
48e0ef6 DiffView テストに URL query 同期ケースを追加する
a04c47e DiffView に URL query 同期を組み込む
0330454 front に url-state モジュールを追加する
a7cd283 ADR 0020 を追加し diff の URL query 同期契約を定める
```

## TODO / 残課題

### マージ

- [ ] ユーザー確認後 `feature/diff-url-query-sync` → `main` にマージする (このセッションでは未マージ、push は環境制約で不可)

### 持ち越し Known Issue (本タスクでは手を入れず)

- ADR 0019 MEDIUM-2: `listError` が from/to 両方の combobox の `hasError` に流れる件 (backend の error-mapper に `reason.field` 追加が前提)

## 参考

- 計画書: `.claude/tmp/2026-04-09_diff-url-query-sync.md`
- 実装安全性評価 (初回): `.claude/tmp/2026-04-09_diff-url-query-sync-impl-review.md`
- 前タスク申し送り: `.claude/handover/2026-04-10-02-05-diff-rev-ui.md`
