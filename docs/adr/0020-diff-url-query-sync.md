# 0020. diff ビューの from/to を URL query と同期する

## ステータス

承認済み

## 文脈

ADR 0019 で `DiffView.vue` に from/to セレクタを追加したが、選択結果は Vue の ref に閉じており、URL には反映されていない。ユーザー視点では以下の問題がある:

- リロードすると初期値 (`HEAD` / `(worktree)`) に戻る
- URL 共有で「特定の range の diff 画面」を他者に渡せない
- ブラウザの back/forward と range 変更が連動しない

本 ADR は URL query による range 永続化と履歴連動の契約を定める。バックエンド / API は変更なく、影響範囲は front のみ。

## 決定

### 1. クエリキーは API と同一の `from` / `to`

`packages/front/src/api/diff.ts` の `DiffRangeQuery` と同じキー名を使う。ブラウザ URL と API URL のマッピングがトリビアルになる。

### 2. デフォルト値はキー省略

- `from === 'HEAD'` のときは `from` キーを省略する
- `to === '(worktree)'` のときは `to` キーを省略する
- したがって「初期状態 = 空クエリ」で既存 URL 互換 (リンク壊れなし)

「HEAD と明示入力した状態」と「デフォルト HEAD」は UI 上で区別できないため、両者を同一に扱う方針で副作用は無い (同じ range を fetch する)。

### 3. 副作用外部化: `packages/front/src/url-state.ts`

`window.history` / `window.location` への直接アクセスは DiffView 内で行わず、専用モジュールに閉じる (ルール 070 副作用の外部化)。

契約:

```ts
export type DiffRangeUrlState = { from: string; to: string }

/** URL search 文字列から range を復元する。未指定はデフォルト。 */
export function readDiffRangeFromSearch(search: string): DiffRangeUrlState

/** range を URL search 文字列に変換する (先頭 '?' 込み、デフォルトは空文字)。 */
export function buildDiffRangeSearch(range: DiffRangeUrlState): string

/**
 * 現在 URL と比較して差分があるときのみ history.pushState する。
 * 同一 range の連続書き込みで履歴が膨らむのを防ぐ。
 */
export function pushDiffRangeToUrl(
  history: History,
  location: Location,
  range: DiffRangeUrlState,
): void
```

### 4. history API 戦略: `pushState` + `popstate`

- `onRevSubmit` / `onApply` 時は `pushState` で履歴を積む (back/forward で range 遷移できる)
- `onMounted` で `popstate` リスナを登録し、戻る/進むで URL が変わったら `readDiffRangeFromSearch(window.location.search)` で `fromRev` / `toRev` を同期し、`runDiffLoad(range)` を発火する
- `onBeforeUnmount` でリスナを解除する

### 5. 初期マウント時の復元

`fromRev` / `toRev` の初期値は `readDiffRangeFromSearch(window.location.search)` から算出する。`runDiffLoad` はマウント時に従来どおり発火されるが、`currentRange()` が URL 由来の値を拾うため、初回フェッチから URL の range で行われる。

### 6. `runDiffLoad` の契約は不変

`runDiffLoad(rangeArg?)` の引数仕様は ADR 0019 のまま。URL 更新は UI イベントハンドラ (`onRevSubmit` / `onApply`) と `popstate` ハンドラで行い、`runDiffLoad` 自体は URL を触らない。これにより:

- `defineExpose({ runDiffLoad })` を使うテストが URL 副作用に巻き込まれない
- `popstate` から `runDiffLoad` を呼ぶとき、ハンドラ側で「すでに URL は更新済み」前提に立てる (二重 push の回避)

## 代替案と却下理由

### A. `replaceState` を使う

履歴が積まれない分シンプルだが、back/forward で range を戻せないため UX が劣る。本 ADR は `pushState` を採用する。

### B. vue-router を導入する

過剰。現状 front はルーティング不要の SPA で、DiffView 1 画面のみ。依存を増やす割にメリットが薄い。将来ページが増えた時点で再評価する。

### C. DiffView 内で直接 `window.history` を参照する

ルール 070「副作用の外部化」に反し、テストで history をスタブしにくい。専用モジュールに分離する。

## 影響

- `packages/front/src/url-state.ts` 新規
- `packages/front/src/url-state.test.ts` 新規
- `packages/front/src/components/DiffView.vue`
  - `fromRev` / `toRev` 初期化ロジック
  - `onRevSubmit` / `onApply` の末尾で `pushDiffRangeToUrl`
  - `onMounted` / `onBeforeUnmount` の `popstate` 登録/解除
- `packages/front/src/components/DiffView.test.ts` にケース追加

既存挙動は URL が空のとき ADR 0019 と完全一致する。
