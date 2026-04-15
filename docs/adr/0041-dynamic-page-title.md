# 0041. ページタイトルの動的設定

## ステータス

承認済み (2026-04-15)

## コンテキスト

すべてのページで `<title>git-web</title>` が固定表示されており、複数タブを開いた際にどのページか区別できない。
リポジトリ名・ブランチ/ハッシュ・パスをタイトルに含めることで視認性を向上させたい。

## 決定

### タイトルフォーマット

基本形: `${repoName}:${rev} ${path} - git-web`

各ルートでの表示:

| ルート                   | rev                   | path              | タイトル例                                  |
| ------------------------ | --------------------- | ----------------- | ------------------------------------------- |
| worktree `/`             | `(worktree)`          | query.path or `/` | `my-repo:(worktree) / - git-web`            |
| worktree-blob `/wt/blob` | `(worktree)`          | query.path        | `my-repo:(worktree) /src/main.ts - git-web` |
| revision-tree `/tree`    | query.rev             | query.path or `/` | `my-repo:main /src - git-web`               |
| blob `/blob`             | query.rev             | query.path        | `my-repo:main /README.md - git-web`         |
| diff `/diff`             | `diff ${from}..${to}` | なし              | `my-repo diff HEAD..(worktree) - git-web`   |

### API 変更

`/api/repo` のレスポンス (`RepoInfoDto`) に `name: string` フィールドを追加する。
値はリポジトリルートの絶対パスからディレクトリ名を抽出する (`path.basename()`)。

`name` はリポジトリを識別するドメイン概念であるため、ドメインモデル `RepoInfo` にも追加する。
抽出は service 層で行う。

### フロント側実装

- タイトル文字列の組み立ては純粋関数として実装し、テスト容易性を確保する
- `packages/front/src/composables/use-document-title.ts` に配置する
- `router.afterEach` フックで `document.title` を更新する
- `repo` 未取得時（API 応答前）はフォールバックとして `git-web` を表示する
- `repo` 取得完了時に現在のルートに基づいてタイトルを再設定する

### composables ディレクトリについて

`packages/front/src/composables/` を新設する。
既存の `theme/theme-store.ts` はテーマ関連ファイル群（CSS 変数定義等）と同居しているため移動しない。

## 結果

- ブラウザタブでページの内容を識別できるようになる
- ブラウザ履歴からも遷移先を判別しやすくなる
