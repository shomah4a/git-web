# ADR 0022: ディレクトリツリー表示と Vue Router 導入

## ステータス

提案

## コンテキスト

現在の git-web は diff 表示のみの単一画面 SPA であり、Vue Router を使っていない。
以下の 2 機能を追加する:

1. `/` でリポジトリのディレクトリツリーを表示する (GitHub のリポジトリトップに相当)
2. diff 画面の各ファイルに code / diff タブを追加し、ファイル全文表示と差分表示を切り替える

複数画面を持つことになるため、Vue Router (history mode) を導入してパスベースのルーティングを行う。

## 決定

### ルーティング

| パス    | 画面                          | 主要クエリ                    |
| ------- | ----------------------------- | ----------------------------- |
| `/`     | TreeView (ディレクトリツリー) | `rev` (デフォルト: worktree)  |
| `/diff` | DiffView (既存の差分表示)     | `from`, `to` (既存仕様を維持) |

- Vue Router の history mode を使う
- SPA fallback: 静的ファイル配信 (`static.ts`) で、ファイルが見つからない場合に `index.html` を返す
- 旧 URL (`/` に `from`/`to` クエリ付き) との互換は取らない。URL 設計を一新する

### ツリー画面の rev パラメータ

ツリー画面の `rev` と diff 画面の `from`/`to` は意味が異なる:

- **ツリー画面 `rev`**: 「今見ているリビジョン」(単一値)
- **diff 画面 `from`/`to`**: 「比較する 2 つのリビジョン」

URL 状態管理も独立させ、`url-state.ts` (diff 用) はそのまま維持し、ツリー用は別モジュールとする。

デフォルトの `rev` は worktree とする。これは git-web がローカル開発ツールであり、作業ディレクトリの状態を見るのが最も自然なユースケースであるため。

### API

`GET /api/tree?rev=<rev>&path=<path>` エンドポイントを新設する。

- `rev` 省略時は worktree (ファイルシステム直接参照)
- `path` 省略時はリポジトリルート
- git コミット指定時は `git ls-tree -z --end-of-options <rev> <path>` で取得
- worktree 時はファイルシステムの `readdir` で取得
- path バリデーションは既存の `parseDiffPath` を流用する

### diff 画面の code/diff タブ

各ファイルカードに code / diff のタブ UI を設ける:

- **diff タブ**: 現在の split view をそのまま表示 (デフォルト)
- **code タブ**: to 側のファイル全文を Shiki ハイライト付きで表示
- blob データは既存の `/api/blob` を使用する

## 帰結

- Vue Router の追加により、将来の画面追加 (blame, log 等) が容易になる
- SPA fallback の追加が必要 (`static.ts` の変更)
- CliGitClient に `GitTreeClient` interface が追加される (4 つ目の interface 実装)
