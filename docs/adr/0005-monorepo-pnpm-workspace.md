# 0005. monorepo を pnpm workspace で構成する

## ステータス

承認済み

## 文脈

git-web は API、フロント、共有型定義の 3 領域に分かれる。これらは密結合（型を共有し、API のレスポンスをフロントが直接消費する）でありながら、ビルド・テスト・依存関係は領域ごとに分けたい。

候補:

- 単一パッケージで `src/api` `src/web` `src/shared` をディレクトリで分ける
- npm workspaces
- pnpm workspaces
- yarn workspaces
- Nx, Turborepo 等のメタツール

## 決定

pnpm workspace を採用し、以下の 3 パッケージに分割する:

- `packages/api` (`@git-web/api`)
- `packages/front` (`@git-web/front`)
- `packages/common` (`@git-web/common`)

理由:

- pnpm はディスク効率が良くインストールが速い
- workspace 機能が成熟しており、`workspace:*` プロトコルでの内部依存解決が直感的
- Nx / Turborepo はメタツールとして有用だが、3 パッケージ規模では過剰
- パッケージ境界を物理的に切ることで責務が明確になり、後から「どっちで持つべきか」迷う機会を減らせる

## 結果

- `pnpm install` 一発で全パッケージの依存関係が解決される
- 各パッケージで個別に `build` / `test` / `lint` を実行できる
- ルート `package.json` に `pnpm -r` ベースの集約スクリプトを置く
- pnpm のインストールが利用者の前提となる（`corepack` で対応可）
