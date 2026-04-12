# リビジョンセレクタの表示順変更と件数制限撤廃 (ADR 0032)

## セッション概要

### 実装内容

- **ADR 0032** を新設し、リビジョンセレクタの表示順変更・件数制限撤廃・head 優先枠削除を記録
- 表示順を worktree → main → HEAD → branches → tags に変更
- `RefListDto` / `RefList` から `head`, `truncated` フィールドを削除
- `GitRefsClient.headRef()` を port / adapter から削除
- `parseRefsQuery` から `limit` パラメータを完全削除
- ADR 0025 に ADR 0032 への変更リンクを追記

### コミットハッシュ検索の見送り

当初コミットハッシュの前方一致検索も検討したが、`git rev-list --all` の計算量が O(N)（N = コミット数）であり、ブランチ・タグ検索の O(B+T) と比較してオーダーが大きく異なるため見送った。自由入力によるコミットハッシュの直接指定は従来通り可能。

### ブランチ

`refactor/revision-selector-ordering`

### 変更ファイル

- `docs/adr/0032-revision-selector-simplify.md` — ADR 新設
- `docs/adr/0025-revision-selector-priority.md` — 変更リンク追記
- `packages/common/src/refs.ts` — head, truncated 削除
- `packages/api/src/domain/refs.ts` — RefList から head, truncated 削除、RefsQuery から limit 削除
- `packages/api/src/domain/refs-query.ts` — limit パース完全削除
- `packages/api/src/domain/ports/git-refs-client.ts` — headRef() 削除
- `packages/api/src/adapter/git/cli-client.ts` — headRef() 実装削除
- `packages/api/src/service/refs-service.ts` — headRef 呼び出し・limit 切り詰め・truncated 削除
- `packages/api/src/controller/refs-controller.ts` — DTO 変換から head, truncated 削除
- `packages/front/src/api/refs.ts` — limit 引数削除、型ガード更新
- `packages/front/src/components/RevisionCombobox.vue` — head 優先枠削除、fetchRefs の limit 引数削除
- `packages/front/src/components/DiffView.vue` — fetchRefs の limit 引数削除
- `packages/front/src/components/RevisionTreeView.vue` — fetchRefs の limit 引数削除
- テストファイル群（7ファイル）

### 実装安全性評価結果

- HIGH/CRITICAL: なし
- LOW-1: RevisionCombobox のコメント修正 → 対応済み
- LOW-2: parseRefsQuery の _limitRaw パラメータ → ユーザー指示により完全削除

## TODO

- なし
