# 0055. WorktreeView の git worktree 切替対応

## ステータス

ドラフト

## 文脈

ADR 0023 で導入した `WorktreeView` (`/`) は、git-web プロセスを起動した cwd の作業ツリーのファイル一覧を表示している。

一方、git は `git worktree add` で同一リポジトリに対する複数の作業ツリー (linked worktree) を扱える。Claude Code などのエージェントが `.worktrees/<feature>` 配下で並行作業する運用では、本リポでも `.worktrees/fix-svg-preview` のような linked worktree が存在する。現状はこれらを閲覧するためにそれぞれの worktree ディレクトリで git-web を再起動する必要があり、UX が悪い。

本 ADR では、単一の git-web プロセスから main worktree と linked worktree のファイル一覧を切替閲覧できるようにする方針を定める。

想定ユースケース:

- ユーザーがリポジトリツリーを閲覧しているとき、エージェントが作成した linked worktree のファイル状態を切替表示したい
- 操作 (`git worktree add/remove/lock/unlock`) は対象外。**閲覧専用**

## 決定

### 1. 切替の単位は「worktree」とし、`wt` クエリで指定する

worktree の指定は URL クエリ `wt=<name>` で表現する。`name` は `git worktree list --porcelain` から得た worktree path の basename を基本とし、衝突時はサフィックスで一意化する (§5)。

- `wt` 未指定 / 空: **default worktree** (= git-web 起動時 cwd の worktree)。従来動作と一致
- `wt=<name>`: 該当 worktree のファイル / blob を表示

### 2. API

新規エンドポイント:

- `GET /api/worktrees`: worktree 一覧を返す
  - レスポンス: `{ items: [{ name, path, headHash, branch, isDetached, isDefault, isMain }, ...] }`
  - bare worktree / submodule worktree は除外 (§6)

既存エンドポイントの拡張 (rev 未指定 = worktree モード時のみ意味を持つ):

- `GET /api/worktree?wt=<name>&path=<path>`
- `GET /api/tree-commits?wt=<name>&path=<path>` (rev 未指定時)
- `GET /api/blob?wt=<name>&path=<path>` (rev 未指定時)
- `GET /api/blob/raw?wt=<name>&path=<path>` (rev 未指定時)

リビジョン指定経路 (`/api/tree`, `/api/diff/...`, rev 指定の commits 等) は worktree 概念と直交しているため、本 ADR では拡張しない。

### 3. UI

WorktreeView の `page-header-slot` に `WorktreeCombobox` (新規) を Teleport する。デザインは ADR 0019 の `RevisionCombobox` と同作法 (combobox 風 + 適用ボタン)。

ただし `wt` クエリは「path injection 防御の対象」であり、自由入力を受け付けない:

- `WorktreeCombobox` は `/api/worktrees` の結果から **選択のみ** 可能 (自由入力テキスト未対応)
- 適用時、URL 上の `path` を `''` にリセットする (切替先で同一相対 path が存在する保証がないため)

App.vue ヘッダの HEAD / branch 表示は URL `wt` クエリに追従させる。`/api/worktrees` の結果から該当 worktree の `headHash` / `branch` を引いて表示し、新規 API は追加しない。

### 4. 後方互換

- `wt` クエリ未指定時は従来 (起動時 cwd の worktree) と完全に一致
- 既存ブックマーク URL は影響なし
- フロント API クライアントは `wt` をオプショナル引数として追加し、未指定なら従来通り `wt` パラメータをリクエストに含めない

### 5. worktree 識別子 (`name`)

- `name` = worktree path (realpath 解決後) の basename
- 同一 basename を持つ worktree が複数あった場合、**衝突に関与する全 worktree** に `-<short-hash>` を付与する (一部のみ付ける形式だと 3 つ目の worktree 追加で既存 name が変動するため)
  - `short-hash` は realpath 文字列の SHA-1 先頭 8 文字
- name は URL `wt` 値および API リクエスト値として使用する
- 文字制約 (§7) を満たさない basename は **resolver の list から除外** する (defense in depth)

### 6. bare / submodule worktree の除外

`git worktree list --porcelain` は以下も列挙する可能性がある:

- bare repository の親 (`bare` 行を持つエントリ)
- submodule の worktree (将来の git バージョンで `worktreeOfSubmodule` 等のフラグが付く可能性)
- locked / prunable な worktree

このうち **bare** は repoRoot として扱えないため除外する。**submodule** は本 ADR のスコープ外 (ADR 0054 と同じく)。**locked / prunable** は閲覧用途では問題ないため列挙する (UI 上の特別扱いはしない)。

未知のラインを持つエントリ (将来の git で新フラグが追加された場合) は **conservative に除外** (allowlist 方式) する。

### 7. セキュリティ (パストラバーサル多層防御)

#### 7-1. `wt` 入力検証 (controller)

- 許容文字集合: URL-safe 文字 (`A-Z a-z 0-9 . _ - ~`) と percent-encoded UTF-8 (basename に日本語等を含む worktree を許容するため)
- 禁止: `/`, `\`, `\0`, `..` 連続、空文字、長さ 256 超
- 検証失敗時は HTTP 400

#### 7-2. authoritative source による解決

- `wt` は `git worktree list --porcelain` の結果から得た authoritative name → path マップでのみ解決
- マップに無い name は 400
- クライアントが path を直接送る経路は存在しない

#### 7-3. `BoundedWorktreePath` 型による narrowing

```typescript
export type BoundedWorktreePath = {
  readonly __brand: 'BoundedWorktreePath'
  readonly absolutePath: string
}
```

- 生成は resolver 内部のみ。ファイル外への factory function 公開はしない
- factory / reader / git client は `BoundedWorktreePath` のみ受け付ける。文字列 path を直接渡す経路を型レベルで排除

#### 7-4. realpath + `path.resolve` の両側正規化

- `BoundedWorktreePath.absolutePath` は `fs.realpath` → `path.resolve` 済みの絶対パスを格納
- 既存 `isInsideRepo` を強化し、root / target 両方を `path.resolve` で正規化してから比較

#### 7-5. `.git` segment の拒否

- `parseDiffPath` に追加検証: path segment に `.git` を含むものを拒否
- linked worktree の `.git` ファイル (gitdir ポインタ) 経由で内部ファイルにアクセスされることを遮断
- 既存挙動でも本質的に望ましくなかったため、本 ADR で恒久対応する

#### 7-6. fail-closed

- name 解決不可 → 400 (空ディレクトリを返さない)
- 起動時 cwd と一致する worktree が porcelain に見つからない → **起動時エラー** で fail-fast

#### 7-7. プラットフォーム前提

- Linux / macOS / WSL2 のみ対象。Windows / 大文字小文字非区別 FS は対象外
- macOS の NFC/NFD ファイル名は将来課題 (本 ADR では明示しない)

### 8. パフォーマンス

`WorktreeResolver` は `git worktree list --porcelain` の結果を **TTL 5 秒でメモ化** する:

- TTL 内は in-memory map を引き、fork+exec を避ける
- TTL 内で未知 name に遭遇したら invalidate して再フェッチ → それでも見つからなければ 400
- `git worktree add/remove` 後の追従は最大 5 秒遅延
- 「キャッシュ無し」「より長い TTL」「ファイルウォッチ」は将来課題

### 9. レイヤ構成 (ADR 0011 準拠)

- `common`: WorktreeListItemDto / WorktreesListResponseDto
- `domain`:
  - `WorktreeInfo` (bare 等のメタ込み)
  - `BoundedWorktreePath`
  - `GitWorktreeListClient` port
- `adapter/git`:
  - `worktree-list-parser.ts` (純粋関数)
  - `worktree-list-client.ts` (`LC_ALL=C` 固定の execFile 呼出)
- `service`: `worktrees-list-service.ts` (bare/submodule 除外、name 衝突解決)
- `lifecycle`: `worktree-resolver.ts` (TTL キャッシュ + default 同定) / `worktree-context-factory.ts` (BoundedWorktreePath → reader/client セットの組立)
- `controller`: `worktrees-list-controller.ts` + 既存 controller の `wt` クエリ対応

## 影響

- 後方互換は維持される (wt 未指定で従来動作)
- `parseDiffPath` の `.git` 拒否は既存テストに影響する可能性 (修正で対応)
- DI グラフが一部リクエストごとに動的に組み立てられる (factory 経由)

## 不採用案

### A. 全画面 worktree-aware

`/commits`, `/graph`, `/diff` 等も含めて全画面で worktree 切替を反映する案。

不採用理由:

- リビジョン指定経路は worktree 概念と直交する (rev で指す履歴は worktree に依存しない)
- スコープが大きく、想定ユースケース (閲覧切替) には過剰

### B. WorktreeView を 2 段構成 (worktree 一覧 → ファイル一覧)

worktree 一覧画面を別途設け、行クリックでファイル一覧へドリルダウンする案。

不採用理由:

- 既存 WorktreeView の構造を大きく変えることになる
- ユーザー要件 (「ブランチ切り替えと同じ作法」「切り替えたらそのディレクトリのファイル一覧として振る舞う」) と合致しない

### C. `wt` を path で指定

`wt=/home/user/.worktrees/foo` のように絶対パスで指定する案。

不採用理由:

- path injection / 任意ディレクトリ閲覧の攻撃面を増やす
- name 識別子 + authoritative source 解決のほうが安全

## 関連 ADR

- ADR 0011: API レイヤリング
- ADR 0019: from/to のリビジョン指定コンボボックス (UI 作法の参照元)
- ADR 0023: WorktreeView の分離
- ADR 0038: WorktreeBlobView
- ADR 0054: ファイル単位の最終コミット表示
