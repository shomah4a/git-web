# git-web

ローカルで動く git リポジトリビューア。`git web` として呼び出して、ブラウザで diff やディレクトリツリーを閲覧できる。

## 主な機能

- **Worktree**: 作業ディレクトリの状態をテーブル表示
- **Tree**: 任意リビジョンのディレクトリツリー表示（ブランチ/タグ選択、README 自動表示）
- **Blob**: ファイル内容表示（Shiki によるシンタックスハイライト、Markdown/Mermaid レンダリング）
- **Diff**: 任意の 2 リビジョン間の差分を Split View で表示（シンタックスハイライト付き）

## 構成

monorepo (pnpm workspace) 3 パッケージ + ローカル pnpm ラッパー:

| パス              | 役割                                                |
| ----------------- | --------------------------------------------------- |
| `packages/common` | API ⇄ フロント間で共有する TypeScript 型定義        |
| `packages/api`    | `node:http` + 自前ルーターによる薄い HTTP サーバー  |
| `packages/front`  | Vue 3 + Vite の SPA                                 |
| `bin/pnpm`        | リポジトリローカル pnpm ラッパー (corepack 経由)    |
| `bin/git-web`     | エントリスクリプト、api 起動 + ブラウザ自動オープン |
| `docs/adr/`       | アーキテクチャ決定記録                              |
| `.claude/rules/`  | 開発プロセス / パッケージ管理ルール                 |

技術選定の根拠は `docs/adr/` を参照してください。

## 必要環境

- Node.js 22 以上（corepack 同梱）
- git CLI
- 動作確認環境: Linux / WSL2。macOS は未検証だが動くはず。Windows ネイティブは対象外。

## セットアップ

```
./bin/pnpm install
./bin/pnpm check
```

`./bin/pnpm` はリポジトリローカルの pnpm ラッパーで、`package.json` の `packageManager` フィールドで指定されたバージョンを corepack 経由で `.corepack/` にキャッシュして実行します。システムやユーザーホームを汚しません。

`./bin/pnpm check` は以下を一括実行します:

- `eslint` による lint
- `prettier --check` によるフォーマット検査
- 各パッケージの build (`tsc -b` / `vite build`)
- 各パッケージの typecheck (`tsc --noEmit` / `vue-tsc --noEmit`)
- 各パッケージの `vitest run`

## 起動

ビルド済みであれば以下で起動します。

```
./bin/pnpm build
./bin/git-web
```

起動後、OS が割り当てた空きポートで待ち受け、URL を標準出力に表示してブラウザを自動で開きます。同一リポジトリですでに `git-web` が起動中の場合は新しいプロセスを立てず、既存インスタンスの URL を表示してブラウザを開きます（ADR 0044 参照）。

```
git-web listening on http://127.0.0.1:46733
target repository: /home/user/some-repo
```

同じリポジトリで `git web` を再実行した場合:

```
git-web already running for this repository: http://127.0.0.1:46733
target repository: /home/user/some-repo
existing pid: 12345
```

複数のリポジトリで並行に起動できます（ポートは衝突しません）。待ち受けポートを固定したい場合（dev サーバーのプロキシ先など）は `PORT` 環境変数を明示指定してください。

```
PORT=47906 ./bin/git-web
```

稼働中のインスタンス情報は `$XDG_STATE_HOME/git-web/instances.json`（デフォルト `~/.local/state/git-web/instances.json`）に記録されます。

### `git web` として呼び出す

`git` は PATH 上の `git-foo` コマンドを `git foo` として呼び出せる仕組みを持っています。これを利用するには、`bin/git-web` を PATH の通った場所に置きます。

```
ln -s "$(pwd)/bin/git-web" ~/.local/bin/git-web
```

その後、任意の git リポジトリで:

```
cd /path/to/your-repo
git web
```

## 開発

### Makefile (人間用)

よく使うコマンドは Makefile にまとめています。

```
make help      # 一覧
make install   # 依存インストール
make test      # 全パッケージのテスト
make lint      # lint
make fmt       # フォーマット適用
make fmt-check # フォーマット検査
make typecheck # 型チェック
make check     # lint + fmt-check + build + typecheck + test
make serve     # ビルド後 ./bin/git-web を起動
make clean     # ビルド成果物とローカルキャッシュを削除
```

### 開発時 (dev サーバー + API)

front は Vite の dev サーバーから起動し、`/api` リクエストは 127.0.0.1:47906 の api サーバーにプロキシされます（`vite.config.ts` の proxy 設定）。dev 時は以下の 2 プロセスを並走させます。

```
# 事前にビルド (common + api が必要)
./bin/pnpm build

# ターミナル 1: api をポート 47906 で起動
PORT=47906 ./bin/git-web

# ターミナル 2: front dev サーバー (api の 47906 番にプロキシ)
./bin/pnpm --filter @git-web/front dev
```

### パッケージ追加時の注意

依存パッケージを新規追加する際は、必ず最新安定版を `./bin/pnpm view <pkg> version` で確認してから完全バージョン固定で追加してください。詳細は `.claude/rules/package-management.md` を参照してください。

```
./bin/pnpm view some-package version
./bin/pnpm add some-package@1.2.3 --filter @git-web/<pkg>
```

## ドキュメント

- `docs/adr/`: アーキテクチャ決定記録 (ADR)
- `.claude/rules/dev-process.md`: 開発プロセスと ADR 運用ルール
- `.claude/rules/package-management.md`: パッケージ管理ルール (pnpm 統一、バージョン固定)
