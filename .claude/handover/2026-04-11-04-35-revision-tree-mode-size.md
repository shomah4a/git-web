# リビジョンツリー mode/size 表示

## セッション概要

### 実装内容

- **ADR 0026** を新設し、リビジョンツリーへの mode/size 表示追加と worktree 選択除外を定めた
- **ドメイン層**: `TreeEntry` に `mode: string | null`, `size: number | null` を追加
- **アダプタ層**:
  - `cli-client.ts`: `git ls-tree -z` → `git ls-tree -l -z` に変更
  - `ls-tree-parser.ts`: mode/size をパース。スペースパディング対策として `split(' ').filter(s => s.length > 0)` を使用。tree エントリの size (`-`) は null に変換
  - `ls-files-parser.ts`: TreeEntry 構築箇所で `mode: null, size: null` を追加
- **共通 DTO**: `TreeEntryDto` に mode/size フィールド追加
- **コントローラ**: DTO 変換で mode/size を通す
- **フロント API**: 型ガードに mode/size チェック追加
- **フロント表示**: `RevisionTreeView.vue` に Mode/Size カラム追加、`allow-worktree` を `false` に変更、デフォルト rev を `HEAD` に変更
- **テスト**: ls-tree-parser.test.ts に2ケース追加、既存テストの期待値更新。全518テスト通過

- **DTO 共通化**: `EntryBaseDto` を `packages/common/src/entry-base.ts` に新設し、`TreeEntryDto` / `WorktreeEntryDto` が拡張する形に変更
- **formatSize/formatMode 共通化**: `packages/front/src/format/entry.ts` に抽出し、両コンポーネントから参照

### ブランチ

`feature/revision-tree-mode-size` (2 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。LOW 1件（Number() の NaN 防御 → 不要と判断）。

## TODO

- [ ] main への merge（ユーザー判断）
