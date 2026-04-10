# リビジョンセレクタ優先表示

## セッション概要

### 実装内容

- **ADR 0025** を新設し、リビジョンセレクタの優先表示ルールを定めた
- **バックエンド**: `RefListDto` / `RefList` に `defaultBranch: string | null` フィールドを追加
  - service 層で `listBranches()` の全件から main → master の順で探索（limit の影響を受けない）
  - controller の DTO 変換、フロントの型ガード `isRefListDto` も更新
- **フロントエンド**: `RevisionCombobox.vue` の `options` computed の候補順序を変更
  - (worktree) → defaultBranch → HEAD → head → branches → tags
  - 重複排除は既存の Set ベースロジックで対応
- **テスト**: defaultBranch 関連の新規テスト6件追加、既存テストの期待値・インデックス更新
  - 全516テスト通過（common 6, api 360, front 150）

### ブランチ

`feature/revision-selector-priority` (1 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。LOW 2件（型ガードテスト追加 → 対応済み、HEAD 常時表示 → 仕様として許容）。

## TODO

- [ ] main への merge（ユーザー判断）
