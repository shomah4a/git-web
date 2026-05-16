# 0056. ファイル単位 history への導線追加

## ステータス

承認

## 文脈

ADR 0046 で導入した `/commits` ルートは、起点リビジョンから遡る形でコミット履歴を一覧できる。`path` クエリでパス絞り込みも既にサポートされている (`git log -- <path>`)。

しかし、現状のフロントエンドにはファイル単位の history へ辿り着く導線がない。`/commits?path=<file>` を直接 URL に打ち込むしかなく、発見可能性が低い。

ユーザー要望:

- ファイル一覧 (RevisionTreeView / WorktreeView) の Last commit message / date 列から該当パスの history へリンクしたい
- blob ビュー (BlobView / WorktreeBlobView) の右上、印刷モードボタンの左に history ボタンを置きたい

## 決定

### 1. 既存の `/commits?path=` を再利用する

新規ビューやエンドポイントは追加しない。既存の `/commits?rev=<rev>&path=<path>` ルートに導線を増やすだけにする。

ADR 0046 の `path` 仕様は「`git log -- <path>` 相当のパス絞り込み」であり、ファイル / ディレクトリのどちらでも動作する。本 ADR ではこのモデルを尊重し、**ツリービューの Last commit セルは blob / tree の双方をリンク化** する。

- blob (ファイル) のリンク: そのファイルが変更されたコミットの履歴
- tree (ディレクトリ) のリンク: そのディレクトリ配下のいずれかのファイルが変更されたコミットの履歴 (= `git log -- <dir>/` の挙動)

The Zen of Python "There should be one obvious way to do it" に従い、ファイル / ディレクトリ問わず history への入り口は `/commits?path=` の単一経路にする。
blob 専用ビュー (BlobView / WorktreeBlobView) の history ボタンは性質上ファイル単位のみだが、URL モデルとしては同じ `/commits?path=` を使う。

### 2. 導線の配置

#### 2.1. RevisionTreeView / WorktreeView の Last commit 列

`Last commit message` セルと `Last commit date` セルをクリッカブルにする。

- リンク化対象は `lastCommit !== null` の行 (blob / tree 双方)
- リンク先: `/commits?rev=<rev>&path=<entry.path>`
- `lastCommit === null` の行 (例: 未追跡ファイル) はテキスト `—` のまま

行クリックの blob / tree 遷移と二重発火を避けるため、リンク要素には `@click.stop` を付ける (`HistoryLinkCell` に内包)。

#### 2.2. BlobView / WorktreeBlobView の history ボタン

`.blob-toolbar` 内、`.chromeless-toggle` (印刷モードボタン) の **左** に history アイコンボタンを追加する。

- 実装は `<router-link>` ベースとし、middle-click / Ctrl+Click による新規タブ表示を可能にする
- 見た目は `.chromeless-toggle` と同じスタイル (border / padding / hover) を流用
- `.blob-toolbar` 全体が `@media print` で非表示になるため個別対応は不要

### 3. rev クエリの値

`/commits` には `wt` クエリが存在しない (ADR 0055 で `wt` を追加した対象は `/api/worktree` / `/api/tree-commits` / `/api/blob` / `/api/blob/raw` のみで、`/api/commits` は対象外)。

そのため worktree モードからの history 遷移時の rev は以下のように扱う:

| 元ビュー                           | wt                   | rev に渡す値                                                 |
| ---------------------------------- | -------------------- | ------------------------------------------------------------ |
| RevisionTreeView                   | 概念上 N/A           | `currentRev` (URL の rev クエリ、または `HEAD`)              |
| WorktreeView (`wt=null` / default) | default worktree     | `rev` クエリを省略 (= CommitsView 側で `HEAD` シンボル解決)  |
| WorktreeView (`wt=<name>`)         | 該当 linked worktree | 該当 worktree の `headHash` (`WorktreeListItemDto.headHash`) |
| WorktreeBlobView (`wt=null`)       | default worktree     | `rev` クエリを省略                                           |
| WorktreeBlobView (`wt=<name>`)     | 該当 linked worktree | 該当 worktree の `headHash`                                  |

これにより、別 worktree が指す HEAD と異なるリビジョンの履歴が表示されることを防ぐ。

### 4. headHash 未解決時の挙動 (race condition 対策)

`/api/worktrees` の fetch は非同期で、結果が返るまでに以下のような race window が存在する:

- WorktreeView: `loadWorktreesList()` 完了前に `loadTreeCommits()` が完了し、行が描画される
- WorktreeBlobView: `onMounted` で fetch 開始した直後にユーザーが history ボタンをクリック

サイレントに別ブランチの履歴を表示してしまうことを避けるため、以下の方針を採る。

- **WorktreeView**: 対象 worktree の `headHash` が解決できない (worktrees list 未取得 / 該当アイテム不在 / headHash が null) 場合、Last commit セルは**リンク化せずテキスト表示のままにする**
- **WorktreeBlobView**: history ボタンを、対象 worktree の `headHash` が解決完了するまで `disabled` 状態にする。`wt=null` (default worktree) の場合は rev 省略で即 enabled とする

「Explicit is better than implicit」「Errors should never pass silently」に基づく判断。

### 5. URL 構築の共通化

`buildHistoryUrl(rev: string | null, path: string): RouteLocationRaw` ヘルパーを新設する。

- `rev` が `null` または `'HEAD'` の場合は rev クエリを省略する
- `path` は常に含める (空文字は呼び出し側で除外)
- 戻り値は vue-router の `RouteLocationRaw` 形式 (`{ path: '/commits', query: { ... } }`)
- 配置: `packages/front/src/components/history-url.ts` (ヘルパー単一機能のため軽量モジュール)
- pure 関数とし、Mock 不要で単体テストする (グローバルコーディング規約 070 §副作用の外部化)

複数コンポーネントが同じ URL 構築ロジックを重複実装することを防ぐ。

### 6. アイコン

history アイコンは Lucide 系の `rotate-ccw-clock` 風 SVG を inline で各コンポーネントに記述する。

```html
<svg
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
  <path d="M3 3v5h5" />
  <path d="M12 7v5l4 2" />
</svg>
```

chromeless-toggle と同じインライン記述パターンを踏襲する。

## 非採用案

### A. `/api/commits` に `wt` クエリを追加する

長期的にはこの方が ADR 0055 と整合する。しかし以下の理由で本 ADR では先送りする。

- 既存の `/api/commits` は revision (`rev`) に閉じた API で、worktree 概念を持ち込むと領域横断的な仕様変更になる
- `headHash` を `rev=` に渡せば等価な結果が得られる (commits は履歴を読むだけで作業ツリーは関係ない)
- 将来 `/api/commits?wt=` を追加する際、本 ADR の暫定挙動は deprecated にできる経路を残す

§Future Work に記載。

### B. 専用の `/file-history` ルート新設

CommitsView が既に `path` フィルタを完備しており、stats / diff / tree 遷移などの機能を再実装する必要はない。「やり方は一つ」に従い不採用。

### C. ファイル一覧の行クリックで history へ遷移

現状の行クリックは blob / tree 遷移に割り当てられており、置き換えると既存 UX を破壊する。明示的なリンク列または専用ボタンを追加する形にとどめる。

### D. ディレクトリ行をリンク化しない (blob 限定)

当初は「ユーザー要望が『ファイル単位』だから tree 行はリンク化しない」案を検討した。しかし `/commits?path=` のモデルは元々「任意のパス絞り込み」であり、blob 限定にすると ADR 0046 の path 仕様と乖離する。
The Zen of Python "There should be one obvious way" にも反するため、本 ADR ではディレクトリも含む「任意のパスについて履歴を表示する」モデルを採用した。

## Future Work

- `/api/commits` の `wt` クエリ対応。実装後は本 ADR の §3 表の暫定挙動を `wt=<name>` に置き換える
- `git log --follow` によるファイル rename 追従。ADR 0046 の既知制約だが、ファイル history への入り口が増えることで顕在化する可能性が高い

## 関連 ADR

- ADR 0046: コミット履歴ビュー (本 ADR が再利用するルート)
- ADR 0054: ファイル単位の最終コミット表示 (本 ADR がリンク化する Last commit 列の出元)
- ADR 0055: WorktreeView の worktree 切替対応 (`wt` クエリの導入元)
