# 0007. git 操作は子プロセス経由 (`execFile`) で行う

## ステータス

承認済み

## 文脈

git リポジトリの情報を取得するために、Node.js から git にアクセスする必要がある。
候補:

補遺 (2026-04-07): 本 ADR の「決定」セクションのうち実装方針に関する 2 点が、[ADR 0011](0011-api-layering.md) の api パッケージレイヤリングによって変更された:

- `execFile` を呼ぶコードの集約先は `packages/api/src/git.ts` から `packages/api/src/adapter/git/cli-client.ts` (`CliGitClient` クラス) に移動した
- `execFile` の runner 注入による DI 化方針は、現実装では採用していない。代わりに adapter 層のテストを `mkdtemp` で作った一時 git リポジトリに対する実 git CLI 呼び出しで行うスタイルに切り替えた。理由は GitClient interface 自体が port になっており、上位層 (service / controller) のテストでは GitClient フェイクに差し替えれば十分であるため、`execFile` runner 注入の二重抽象は冗長と判断した

下記の「決定」セクションは当時の判断として残している。

- `nodegit`: libgit2 の Node バインディング、ネイティブビルドが必要、メンテ活発度が低い時期がある
- `isomorphic-git`: pure JS、機能は豊富だが API 表面が広い
- `simple-git`: 子プロセスラッパ、抽象度は中程度
- `child_process.execFile('git', ...)`: stdlib 直、依存ゼロ

## 決定

stdlib の `child_process.execFile`（の Promise 版 `util.promisify(execFile)`）を直接使う。

実装方針:

- `execFile` を呼ぶ関数は `git.ts` に集約する
- `execFile` 自体は依存性注入で外部から渡せる形にし、テストではモック runner を渡す（副作用の外部化原則に従う）
- **`shell: true` は絶対に使わない**（コマンドインジェクション対策）
- 引数は必ず配列で渡す
- 任意のリビジョン文字列・パスを git に渡す箇所では `--` 区切りを徹底する
- 対象リポジトリは起動時の cwd 固定（クライアントから受け取らない）

## 結果

- 依存ゼロ
- 利用者の環境に `git` バイナリがインストールされていることが前提（ローカルツールなので妥当）
- git CLI のバージョン差異に対する耐性は低い（必要なら最低バージョンを README に明示）
- テスタビリティを保つため、すべての git 呼び出しは runner 注入経由で行う
- セキュリティ境界の詳細は ADR 0009 を参照
