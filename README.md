# git-web

ローカルで動く git リポジトリビューア。`git web` として呼び出して、ブラウザで diff や commit graph などを閲覧することを目的とする。

## ステータス

初期構築フェーズ。動く骨格を組み立て中。

## 構成

monorepo (pnpm workspace) で 3 パッケージ構成:

- `packages/api`: `node:http` + 自前ルーターによる薄い HTTP サーバー
- `packages/front`: Vue 3 + Vite によるフロントエンド
- `packages/common`: API ⇄ フロント間で共有する TypeScript 型定義

詳細な技術選定の根拠は `docs/adr/` を参照。

## 開発プロセス

開発手順とルールは `.claude/rules/` を参照。
