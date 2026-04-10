# ADR 0025: リビジョンセレクタの優先表示

## ステータス

承認済み

## コンテキスト

RevisionCombobox (ADR 0019) の候補リストは、バックエンドから取得した refs を head → branches → tags の順に並べている。
しかし、よく使われるリビジョン（デフォルトブランチ、HEAD）が候補の中に埋もれてしまい、素早く選択できない。

また、デフォルトブランチ（GitHub における main/master）の情報はバックエンドの `RefListDto` に含まれていない。
バックエンドの refs API は limit による切り詰めを行うため（ADR 0018）、フロント側で branches から main/master を探す方式では、ブランチ数が多い場合にレスポンスに含まれない可能性がある。

## 決定事項

### バックエンド: `defaultBranch` フィールドの追加

- `RefListDto` / `RefList` に `defaultBranch: string | null` フィールドを追加する
- service 層で `listBranches()` の全件結果から `main` を探し、なければ `master` を探す
  - どちらも存在しなければ `null`
  - `main` と `master` が両方存在する場合は `main` を優先する
- `defaultBranch` の判定は limit による切り詰め前の全件に対して行う

### フロントエンド: 候補リストの優先順序

RevisionCombobox の `options` computed における候補の並び順を以下とする:

1. `(worktree)` — `allowWorktree` が true の場合のみ
2. `defaultBranch` — null でなければ表示
3. `HEAD` — 文字列リテラル（git の特殊参照）
4. `head` — チェックアウト中のブランチ名（null でなければ、上位と重複しなければ）
5. 残りの branches（重複排除済み）
6. tags（重複排除済み）

重複排除は既存の Set ベースのロジックで対応する。

## 根拠

- デフォルトブランチと HEAD は最も頻繁に参照されるリビジョンであり、先頭に配置することで操作効率が向上する
- バックエンド側で defaultBranch を判定することで、limit による切り詰めの影響を受けない
- main/master の優先順位は GitHub のデフォルトブランチ命名慣習に従う
