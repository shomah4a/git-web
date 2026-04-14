# HEAD 表示にブランチ名を追加する

## セッション概要

- ヘッダーの HEAD 表示を改善し、ブランチ上であればブランチ名とコミットハッシュを両方表示するようにした
- detached HEAD の場合はコミットハッシュのみ表示する
- `head` フィールドを `string` から `{ commitHash: string; branch: string | null }` に構造化
- ADR 0037 を作成
- ブランチ: `feature/head-branch-display`、コミット: `3e3cf34`, `0867e18`, `607a6d8`

## TODO

- main へのマージ
