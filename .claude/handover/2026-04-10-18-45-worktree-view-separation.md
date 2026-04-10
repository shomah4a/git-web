# worktree 画面の分離と専用 API 新設

## セッション概要

### 実装内容

- **ADR 0023** を新設し、worktree 画面分離の設計を定めた
- **ADR 0022** に変更リンクを追記
- **既存 TreeView のリネーム**: TreeView.vue → RevisionTreeView.vue、`/` → `/tree` に移動
- **GET /api/worktree** エンドポイント新設
  - `git ls-files --stage` で mode、`git status --porcelain=v1 -z` で status、`fs.stat` で size を取得
  - `-- <path>/` 引数で git 側フィルタを行い大規模リポジトリ対応
  - ディレクトリ配下に変更ファイルがあれば status を `'modified'` に集約
- **WorktreeView.vue** 新設、`/` にマウント
  - カラム: Status | Name | Mode | Size
  - パンくずナビゲーション、ディレクトリドリルダウン

### ブランチ

`feature/split-worktree-revision-view` (6 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。LOW 3 件 (全て対応済みまたは仕様範囲内)。

## TODO

- [ ] main への merge (ユーザー判断)
- [ ] DiffView のテストが変更前から壊れている (vue-router の mock 問題、本タスクとは無関係)
- [ ] 最終コミット情報 (commitId, date, author) の非同期遅延ロード (別フェーズ)
- [ ] リビジョンツリー側のメタデータ追加 (別フェーズ)
- [ ] worktree 画面からの git add 等の操作 (別フェーズ)
