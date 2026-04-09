# 0019. diff ビューの from/to セレクタ UI

## ステータス

承認済み (タスク B: フロントエンド側のみを対象とする。バックエンド側は ADR 0018 で決定済み)

## 文脈

ADR 0018 でバックエンド側の Revision 許可形式拡張と `GET /api/refs` が実装された。残るフロントエンド側は、diff 画面上から from / to を切り替えられる UI を提供する必要がある。

現状の `packages/front/src/components/DiffView.vue` は `onMounted` 時に `fetchDiffFiles()` を引数無しで呼び、「worktree vs HEAD」固定で動作している。ADR 0014 / ADR 0015 / ADR 0017 で積み上げた非同期処理 (世代カウンタによる後発優先、Shiki ハイライト、blob 並列取得) を壊さずに from/to セレクタを足したい。

本 ADR はその UI 設計と、DiffView.vue に加える改修の契約点を定める。バックエンド API 側の契約は ADR 0018 に従い、本 ADR では触れない。

## 決定

### 1. UI 構成

- `DiffView.vue` の `.diff-view` 直上に `<header class="rev-selector">` を配置する
- header には左から順に:
  - `from:` ラベル + `RevisionCombobox` (allowWorktree=false)
  - `to:` ラベル + `RevisionCombobox` (allowWorktree=true)
  - 「適用」ボタン
- 既定値は `from = "HEAD"`, `to = "(worktree)"` とし、現行の「worktree vs HEAD」挙動を維持する

### 2. `(worktree)` は UI 側のみの仮想 ref

- UI 上の文字列として `(worktree)` を用い、DTO やモジュール境界では使わない
- DiffView 内の定数 `WORKTREE_SENTINEL = '(worktree)' as const` を 1 箇所で定義し、分岐の判定はすべてこれを経由する
- API クエリへのマッピング:
  - `from` 側に worktree 項目は出さない (UI から選べない)
  - `to === WORKTREE_SENTINEL` の場合、`DiffRangeQuery.to` は `undefined` とし URL に載せない
- blob fetch (ADR 0016 / 0017) 用の old/new rev 決定:
  - old = `range.from ?? null` (range.from が undefined になるのは from にも worktree を許したときだけだが UI 上は起きない)
  - new = `range.to ?? null` (worktree のとき null → ADR 0016 のセマンティクスで worktree の blob を引く)

この方針により、blob 側で今まで `'HEAD'` と `null` をハードコードしていた箇所は「range から導出する関数」の一点に集約される。

### 3. `RevisionCombobox.vue` の契約

本コンポーネントは自前実装する。Vue 以外の新規依存は入れない (package-management の supply chain 観点)。

#### props

- `modelValue: string`
- `initialRefs: RefListDto | null`
  - 親 DiffView が `onMounted` で一度だけ `fetchRefs('', 50)` して取得した初期候補
  - combobox 自身は初期 fetch を行わない (refs 取得の並行発火を避けるため)
  - null の場合は候補無し (refs 取得失敗 / 未完了) で、自由入力のみ可能
- `allowWorktree: boolean`
- `placeholder?: string`
- `hasError?: boolean` (真のとき入力欄の border を赤くする)

#### emits

- `update:modelValue` (string)
- `submit` (Enter 確定時)

#### 内部動作

- 候補リスト構成順:
  1. `allowWorktree === true` のとき先頭に `(worktree)`
  2. `refs.head`
  3. `refs.branches`
  4. `refs.tags`
- 入力文字列変更時、debounce 200ms で `fetchRefs(inputText, 50)` を再取得する
- 並行発火時は `lastIssuedGen` を使った世代カウンタで後発優先とする (AbortController は導入しない)
- 選択 (クリック / Enter): `emit('update:modelValue', value)` → `isOpen=false`
- 自由入力確定 (highlight 無しで Enter): `inputText` をそのまま `modelValue` として確定
- Esc キー: 候補リストを閉じる
- ↑ / ↓ キー: highlightIdx を循環移動
- 候補中に head/branch/tag の同名 (ADR 0018 note の `refs/tags/...` に化けるケース) がある場合は **サーバから返ってきた文字列をそのまま表示** する。UI 側でアイコン分離などはしない (将来拡張)

#### unmount 時

- 保留中の debounce setTimeout を `clearTimeout` で破棄する
- `isUnmounted` フラグを立て、遅延 fetch 完了時の emit を抑止する

#### a11y

MVP として以下のみ対応する (フル ARIA combobox パターン準拠ではない):

- ルート input に `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`
- 候補 li に `role="option"`, `aria-selected`
- 候補 ul に `role="listbox"`, id (input の aria-controls と一致)

スクリーンリーダー実機での動作検証は行わない。

### 4. `DiffView.vue` 改修

#### 4.1 `runDiffLoad` シグネチャ拡張

`runDiffLoad(rangeArg?: DiffRangeQuery)` に拡張する。省略時は `currentRange()` が ref から読む。
冒頭で `const range = rangeArg ?? currentRange()` を **1 度だけ** 取り、以降 `fetchDiffFiles` / `fetchDiffFile` / `loadAllTokens` / `fetchAndHighlight` に range を引き回す。

目的:

- ref の再読み込みによって同一世代内で「fetch 時の range と blob 時の range がズレる」race を排除する
- テストから range を明示的に渡せるようにし、defineExpose 経由の制御を保つ

#### 4.2 blob fetch の rev 導出

`resolveBlobRevs(range): { old: string | null; new: string | null }` を一点に定義し、`loadAllTokens` の前で呼ぶ。これまで `fetchAndHighlight(file.path, 'HEAD', 'old')` / `fetchAndHighlight(file.path, null, 'new')` と直接値を書いていた箇所を `resolveBlobRevs(range)` の結果に差し替える。

初期値 `from=HEAD, to=(worktree)` のとき `{ old: 'HEAD', new: null }` になり、現行挙動と同値。

#### 4.3 state 追加

- `fromRev: Ref<string>` 初期値 `'HEAD'`
- `toRev: Ref<string>` 初期値 `WORKTREE_SENTINEL`
- `initialRefs: Ref<RefListDto | null>` 初期値 `null`

#### 4.4 onMounted の改修

`runDiffLoad()` と `fetchRefs('', 50)` を並列発火する。fetchRefs の失敗は `initialRefs` を null のままにするだけで、runDiffLoad 側には影響させない (console.warn のみ)。

#### 4.5 適用ボタン

`<button :disabled="loadingList" @click="runDiffLoad(currentRange())">適用</button>`。
loadingList 中は disabled にし、連打で意図不明な race を招かないようにする。

### 5. エラー分岐

ADR 0018 の `error-mapper` は `InvalidRevisionError` を 400 `invalid_revision` + 文字列 `message` で返しており、`reason` を構造化しない。本 UI も構造化は要求しない。

- `fetchDiffFiles` 失敗 → 既存の catch 節で `listError` に HTTP エラー文字列を載せる (既存挙動)
- `listError !== null` を `RevisionCombobox` の `hasError` prop に流し、border を赤表示する
- `fetchRefs` 失敗 → `initialRefs` を null のままにし、combobox は自由入力のみ動作する

### 6. キャッシュと再取得

- `initialRefs` は DiffView がマウント中は保持し続ける。適用ボタンでの runDiffLoad 再実行では再取得しない
- combobox の入力変化時は combobox 内部のローカル state (`refs`) だけを更新し、DiffView の `initialRefs` は触らない
- 長寿命セッションでブランチが増えても初期表示のみ古くなる点は、MVP では許容する (リロードで更新)

### 7. URL 状態反映は非ゴール

`?from=&to=` クエリ経由の状態反映は本 ADR の範囲外とする。リロードで `from=HEAD, to=(worktree)` に戻る。後続タスクで追加する可能性がある点のみ note として残す。

## 代替案と却下理由

- **Combobox ライブラリ導入 (Headless UI Vue 等)**: supply chain 観点で新規依存は避けたい (package-management ルール)。自前実装の工数 (数百行) は許容範囲。
- **URL クエリ反映も同時に実装**: スコープが広がり検証面積が倍増するため今回は分離。
- **構造化エラー (`reason` 付与)**: `error-mapper` 側の変更が要り、API 境界を触ると ADR 0018 の再調整になるため見送り。文字列 message で MVP として十分。
- **`runDiffLoad` を引数無しのままにし ref 書き換え経由で呼ぶ**: テスタビリティが下がり、range スナップショットの race 対策も実装しにくい。`runDiffLoad(range?)` シグネチャを採用する。

## 影響

- `packages/front/src/api/refs.ts` 新規追加
- `packages/front/src/components/RevisionCombobox.vue` 新規追加
- `packages/front/src/components/DiffView.vue` 改修 (runDiffLoad シグネチャ / blob rev 導出 / state / header UI)
- `packages/front/src/components/DiffView.test.ts` 追加ケース
- `packages/front/src/components/RevisionCombobox.test.ts` 新規
- `packages/front/src/api/refs.test.ts` 新規
- ADR 0012 §5 / 0014 / 0017 のコンテキストに本 ADR へのリンクを追記

## 関連 ADR

- ADR 0009 (セキュリティ境界)
- ADR 0010 (strict 型ポリシー)
- ADR 0012 (diff viewer アーキテクチャ §5)
- ADR 0014 (diff 全ファイル表示)
- ADR 0015 (Split View)
- ADR 0016 (blob エンドポイント)
- ADR 0017 (Shiki ハイライト、世代カウンタ)
- ADR 0018 (Revision 拡張と /api/refs)
