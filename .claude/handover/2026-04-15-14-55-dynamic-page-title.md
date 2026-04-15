# ページタイトルの動的設定

## セッション概要

- ページタイトルを静的な `git-web` から、ルート情報に応じた動的なタイトルに変更した
- フォーマット: `${repoName}:${rev} ${path} - git-web`
- ADR 0041 として設計決定を記録
- ブランチ: `feat/dynamic-page-title`

### 変更内容

1. `/api/repo` のレスポンスに `name` フィールドを追加（`path.basename(repoRoot)` で抽出）
2. `buildPageTitle` 純粋関数でタイトル文字列を組み立て
3. `useDocumentTitle` composable で `router.afterEach` + `watch(repoName)` によりタイトルを動的更新

### 各ルートのタイトル表示

| ルート | タイトル例 |
|--------|-----------|
| worktree `/` | `my-repo:(worktree) / - git-web` |
| worktree-blob `/wt/blob` | `my-repo:(worktree) /src/main.ts - git-web` |
| revision-tree `/tree` | `my-repo:main /src - git-web` |
| blob `/blob` | `my-repo:abc1234 /README.md - git-web` |
| diff `/diff` | `my-repo diff HEAD..(worktree) - git-web` |

## TODO

- main へのマージ
