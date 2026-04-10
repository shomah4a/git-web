# ADR 0026: リビジョンツリーに mode/size を表示する

## ステータス

承認済み

## コンテキスト

WorktreeView (ADR 0023) ではファイルの mode（パーミッション）と size（ファイルサイズ）をテーブルカラムとして表示している。
一方、RevisionTreeView (ADR 0022) では Name カラムのみを表示しており、mode/size の情報がない。

`git ls-tree` の出力には mode 情報が含まれており、`-l` オプションを追加すれば size も取得できる。
バックエンド側では既に mode をパースしているが、ドメインモデル (`TreeEntry`) に含めず破棄している。

## 決定事項

### ドメインモデル・DTO の拡張

- `TreeEntry` および `TreeEntryDto` に `mode: string | null` と `size: number | null` を追加する
- nullable とすることで、worktree 経由のツリー取得時（mode/size を持たない）との互換性を保つ

### バックエンド: `git ls-tree -l` の使用

- `git ls-tree -z` を `git ls-tree -l -z` に変更し、size 情報も取得する
- パーサー (`ls-tree-parser.ts`) で mode と size を抽出して `TreeEntry` に含める
- tree エントリの size は `-` として出力されるため `null` に変換する
- `git ls-tree -l` の出力では size がスペースパディングされるため、パース時に空文字列要素を除去する

### フロントエンド: カラム追加

- `RevisionTreeView.vue` のテーブルに Mode / Size カラムを追加する
- フォーマット関数は `WorktreeView.vue` と同様のロジックを使用する

### worktree 経由の TreeEntry

- `ls-files-parser.ts` から生成される TreeEntry は `mode: null, size: null` で埋める

### RevisionTreeView から worktree 選択を除外

- RevisionTreeView の RevisionCombobox で `allow-worktree` を `false` にする
- リビジョンツリーは特定のリビジョンを指定して閲覧するビューであり、worktree の状態確認は WorktreeView の役割である
- rev 未指定でアクセスした場合のデフォルトを `HEAD` とする

## 根拠

- リビジョンツリー閲覧時にファイルのパーミッションやサイズを確認できることは、コードレビューやデバッグで有用である
- `git ls-tree -l` で必要な情報は取得可能であり、追加の git コマンド呼び出しは不要
- nullable フィールドとすることで、既存の worktree パスへの影響を最小限に抑える
