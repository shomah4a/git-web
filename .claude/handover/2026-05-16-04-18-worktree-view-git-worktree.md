# WorktreeView を git worktree 切替対応にする

## セッション概要

- ブランチ: `feat/worktree-view-git-worktree` (worktree: `.worktrees/worktree-view-git-worktree`)
- 目的: WorktreeView から main worktree と linked worktree のファイル一覧を切替閲覧できるようにする。パストラバーサル対策を多層防御で組む。
- ADR: 0055 (新規、承認済み)。ADR 0023 に後続変更リンクを追記

## 実装内容

### バックエンド

- 新規エンドポイント `GET /api/worktrees`: worktree 一覧 (name/path/headHash/branch/isDetached/isDefault/isMain)。bare は除外
- 既存エンドポイントに `wt` クエリ追加:
  - `/api/worktree`, `/api/tree-commits`, `/api/blob`, `/api/blob/raw`
- wt 解決経路:
  - `parseWtParam` で形式検証 → `InvalidWorktreeNameError` (400)
  - `WorktreeContextResolver` で BoundedWorktreePath に変換 (TTL 5 秒キャッシュ、起動時 fail-fast)
  - 解決不能は `UnknownWorktreeError` (400)
  - 全 client は `WorktreeClientsFactory` で per-request 生成
- `BoundedWorktreePath` brand 型で文字列 path が reader/git client に直接届く経路を型レベルで遮断
- `parseDiffPath` で `.git` segment を含むパスを拒否
- `isInsideRepo` を `path.resolve` で両側正規化してから比較
- `WorktreeEntryStatus` に **`ignored`** を追加し、`git ls-files --others --ignored --exclude-standard --directory` の結果も entry に含める (例: main worktree の `.claude/tmp/`)

### フロント

- 新規 `WorktreeCombobox.vue` (RevisionCombobox と同位置 / page-header-slot Teleport、自由入力なしの `<select>`)
- WorktreeView: `wt` URL クエリ同期、切替時 `path=''` リセット
- WorktreeBlobView: `wt` 引き継ぎのみ (selector は WorktreeView から)
- App.vue: ヘッダの repository / HEAD / branch を選択中 worktree に追従
- 各 fetch API クライアントに `wt` オプショナル引数

## テスト結果

- common: 30 件 / api: 700 件 / front: 262 件 — 全 green (`./bin/pnpm check`)
- 動作確認: dev server で main / fix-svg-preview / worktree-view-git-worktree の切替、ignored ディレクトリ表示 (`.claude/tmp/`、`node_modules/` 等)、攻撃ベクタ (`wt=../etc` / `path=.git/HEAD` 等) の 400 応答を実機で確認

## ADR 関連

- ADR 0055 起票: 「WorktreeView の git worktree 切替対応」
  - §7 パストラバーサル多層防御
  - §10 ignored エントリ表示
  - §11 UI 実装上の注意 (`@update:model-value` 排他、`v-if="worktrees.length > 0"` ガード)
- ADR 0023 のステータス節に ADR 0055 へのリンクを追記

## 防衛的計画評価 / 実装安全性評価

- `.claude/tmp/2026-05-15_worktree-view-defensive-plan-review.md`
- `.claude/tmp/2026-05-15_worktree-view-safety-review.md`
- HIGH / CRITICAL なし。MEDIUM 3 件、LOW 4 件。下記 TODO に残存項目を記載

## コミット (新しい順)

- `2d4f3a5` ignored エントリも WorktreeView に表示する
- `7114d5a` fix: WorktreeCombobox の選択で wt が切り替わらない不具合を修正する
- `566c62f` WorktreeBlobView で wt クエリを引き継ぐ
- `154c0f0` App.vue のヘッダ HEAD 表示を選択中 worktree に追従させる
- `a513092` WorktreeView に WorktreeCombobox を統合し wt 切替を有効化する
- `9f84e31` フロント API クライアントに wt パラメータを追加する
- `e2c8892` /api/blob と /api/blob/raw に wt クエリ対応を追加する
- `4fd395a` /api/tree-commits に wt クエリ対応を追加する
- `b404cbc` /api/worktree に wt クエリ対応を追加する
- `952a1e3` parseDiffPath で .git segment を含むパスを拒否する
- `20efef5` isInsideRepo を path.resolve で正規化してから比較する
- `3f90c64` BoundedWorktreePath / WorktreeContextResolver / ClientsFactory を追加する
- `dd9e0cc` /api/worktrees エンドポイントを追加する
- `06377ae` worktree-list-client adapter を追加する
- `1bdcc6a` git worktree list --porcelain のパーサを追加する
- `b2799c6` common に worktrees-list の DTO を追加する
- `79f26f1` ADR 0055 をドラフトとして起票する

## TODO (残存 / 申し送り)

- main へのマージ

### 安全性評価で残った MEDIUM (将来課題)

1. **worktree-list-parser が未知ラベルを除外しない** (ADR §6 と若干齟齬): 現行 git では実害なし。将来 git が submodule worktree 等を新ラベルで識別したときに退行する可能性。`hasUnknownLabel` フラグを追加して service で除外する手当てが推奨。
2. **WorktreeContextResolver の force-refresh が inflight 共有問題**: 並列リクエストで force=true が一時的に効かないエッジケース。fail-closed のため silent な誤動作にはならず、再リクエストで解消。
3. **rev 指定経路 (cat-file) は isInsideRepo ガード対象外**: git cat-file はホスト FS パスを解釈しないので実害なし。ADR §7 への注記推奨。

### LOW (任意)

- App.vue の `activeWorktree=null` 時、ヘッダが repo.head に fallback するため WorktreeView の 400 エラーと UI 不整合
- `WorktreeClientsFactory` / `BoundedWorktreePath` の単体テスト追加
- `unsafeBuildBoundedWorktreePath` の export 強制力 (現状 eslint ルール無し)
- WorktreeView 切替時に worktrees 一覧の再フェッチが行われない (TTL 内挙動)
- `parseSection` で `branchRef` が空文字になりうる defensive check

### 既存 TODO (前回申し送りより)

- `<img>` に `loading="lazy"` `decoding="async"` を追加
- テンプレート内 `getGaps()` の重複呼び出し (パフォーマンス)
- 展開行の左右スクロール同期未設定
- `edgePath` の O(N) 検索を Map 化 (大規模リポジトリ対応)
- 非 ASCII / 改行入りファイル名の C-style クォート解除 (現状 `—` 表示)
- submodule (gitlink) 表示対応 (別 ADR で検討)
- サーバ側 `tree-commits` キャッシュ (顕在化したら LRU 検討)
- フロントの `loadTreeCommits` 用コンポーネントテスト導入時の race condition 検証
