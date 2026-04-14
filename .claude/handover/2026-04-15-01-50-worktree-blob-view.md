# worktree 画面にファイルビューを追加する

## セッション概要

- worktree 画面 (`/`) でファイルクリック時に blob 内容を表示できるようにした
- `/wt/blob?path=<path>` ルートと WorktreeBlobView コンポーネントを新設
- BlobView.vue から blob 表示のコアロジックを BlobContent.vue に切り出し、revision 用・worktree 用で共有
- blob 変換ロジック (resolveBlobContent, isImagePath 等) を blob-content-state.ts に集約
- ADR 0038 を作成
- ブランチ: `feature/worktree-blob-view`、コミット: `51fd7c4`, `260d996`

## TODO

- main へのマージ
