# 0011. api パッケージのレイヤ構造を定義する

## ステータス

承認済み

## 文脈

ADR 0003 で API は node:http + 自前極小ルーターで実装することを決めた。初期構築時点 (ADR 0006 策定時) では、`handlers/repo.ts` のように 1 ファイルに「GitClient の呼び出し」「ドメインロジック」「レスポンス組み立て」が同居しても、処理が単純だったため問題にならなかった。

次フェーズで diff 表示機能を実装するにあたり、以下の処理が新たに加わる見込みがある:

- クライアントから受け取るリビジョン文字列 (`from` / `to`) の形式バリデーション
- diff の実行範囲を表すドメイン値オブジェクトの構築
- `git diff` の呼び出し (execFile 経由)
- `parse-diff` のような外部ライブラリによる unified diff のパース
- ドメインモデルへの変換
- HTTP レスポンスに載せる DTO への変換

これらをすべて 1 つのハンドラに詰め込むと、バリデーションとビジネスロジックと外部ライブラリ依存と HTTP 関心事が混在し、テストが書きづらく、将来の変更影響が読めなくなる。

また、ユーザーから以下の要請があった:

1. controller / service / model の責務を明確に分離したい
2. ドメインモデルを考えて作りたい
3. 現状は node:http 自前実装だが、将来軽量フレームワーク (Hono / Fastify 等) に移行したくなる可能性がある。そのとき HTTP 層を差し替えるだけで済むようにしておきたい
4. ライブラリラッパは adapter/$LIB のようにライブラリ単位で分ける
5. common には front と api の通信用 DTO を置き、ドメインモデルとは型を分離する (たまたま同じシグネチャになってもよい)
6. エラー表現はシンプルな throw + ドメイン例外クラスを整備するレベル

## 決定

### レイヤ構成

`packages/api/src/` 配下を以下のレイヤに分割する:

```
packages/api/src/
├── domain/          ドメイン層 (純粋、外部依存なし)
│   ├── ports/         ドメインが宣言する外部依存 interface (port)
│   │   └── git-client.ts
│   ├── errors.ts      ドメイン例外基底クラス + サブクラス
│   └── repo.ts        RepoInfo ドメインモデル
├── service/         ユースケース層
│   └── repo-service.ts
├── controller/      HTTP ↔ service 橋渡し層 + DTO 変換 + エラーマッピング
│   ├── repo-controller.ts
│   └── error-mapper.ts
├── adapter/         副作用と外部ライブラリのラッパー層
│   └── git/
│       └── cli-client.ts
├── http/            HTTP フレームワーク層 (将来差し替え可能)
│   ├── router.ts
│   ├── server.ts
│   └── static.ts
└── main.ts          配線 (DI、エントリポイント)
```

### 各層の責務

| 層         | 知ってよいもの                         | 知ってはいけないもの                                          |
| ---------- | -------------------------------------- | ------------------------------------------------------------- |
| domain     | TypeScript / 自レイヤの型のみ          | git CLI / HTTP / ファイル I/O / parse-diff 等の外部ライブラリ |
| service    | domain / domain/ports                  | HTTP / フレームワーク / Request/Response / adapter の実装     |
| adapter    | domain / domain/ports / 外部ライブラリ | HTTP / service / controller                                   |
| controller | service / domain / http の Handler 型  | git CLI / parse-diff / child_process                          |
| http       | Handler 型のみ                         | service / domain / controller / adapter                       |
| main       | 全層 (配線専用)                        | —                                                             |

### 依存方向 (一方向)

```
http → controller → service → domain/ports
                                  ↑
                            adapter (port を実装)
                                  ↑
                                main (配線)
```

- `domain` は何にも依存しない (`Error` クラスの継承など ECMAScript 標準機能は使ってよい)
- `service` は `adapter` の実装を知らない。`domain/ports` の interface を受け取る
- `adapter` は `domain/ports` の interface を実装する。`service` や `controller` を import しない
- `controller` は `service` を呼び、DTO 変換と Handler 型への適合を行う
- `http` は Handler 型を定義するだけで、具体的な controller や service を知らない
- `main` が唯一全層を import してよい場所。DI コンテナ的役割

将来、ESLint の `import/no-restricted-paths` ルールで依存方向を機械的に縛る可能性に言及する (本 ADR では規約のみ定義し、機械的強制は別途検討)。

### ドメインモデルと DTO の分離

- **ドメインモデル**: `packages/api/src/domain/` 配下に置く。`type` でも `class` でもよい (振る舞いが必要になったら class 化する)
- **DTO**: `packages/common/` 配下に置く。命名は `*Dto` サフィックス
- service はドメインモデルを返し、controller が DTO に変換して HTTP レスポンスに載せる
- front は DTO のみを参照する (ドメインモデルは見えない)
- **たまたまドメインモデルと DTO のシグネチャが同じでも、型定義は別にする**。これは「wire format の変更をドメインに波及させず、ドメインの変更を wire format に波及させない」という境界を型システムで表現するためである
- ドメインモデル → DTO の変換は **object literal で書き、`as` を使ってはならない** (ADR 0010 に従う)

### ドメイン例外

- `domain/errors.ts` に基底クラス `DomainError extends Error` を定義する
- 具体的なサブクラス (例: `NotAGitRepositoryError`) をそこに配置する
- controller 層の `error-mapper.ts` で `instanceof` によって HTTP ステータスへマッピングする
- 想定外エラーは throw のまま伝播し、http 層で 500 にする
- フレームワーク移行時は `error-mapper.ts` の参照側のみ差し替える

### `start()` のエラー経路の扱い

`main.ts` の `start()` 関数はサーバー起動前に `NotAGitRepositoryError` などを throw する可能性がある。これは **HTTP リクエスト処理経路とは別経路** であり、error-mapper の対象外である。`start()` から throw された例外は呼び出し元 (`bin/git-web` や dev 起動コード) が catch してプロセス終了する。error-mapper は HTTP ハンドラ内で発生した例外のみを対象とする。

### 将来のフレームワーク移行への配慮

現状の `http/` 配下は `node:http` ベースの自前実装だが、将来 Hono / Fastify / Elysia 等に差し替える場合:

- `controller/` の各ハンドラは `(req) => Promise<Response>` 相当のシグネチャを維持する
- フレームワーク固有の `Request` / `Response` 型への変換は `http/` 配下で行う
- `service` / `domain` / `adapter` は一切変更が不要

これを実現するため、`controller` は HTTP フレームワーク固有 API (例: Express の `res.json()`) に依存せず、現状の `Handler` 型 (純粋関数) に従う。

## 結果

### メリット

- 責務が明確になり、テストの粒度が自然に決まる (service 単体テスト / controller 統合テスト / adapter テスト)
- 外部ライブラリの変更影響が adapter 層に閉じる
- HTTP フレームワーク移行時の変更範囲が `http/` に限定される
- ドメインモデルと DTO を分離することで、wire format 変更とビジネスロジック変更が独立して行える

### デメリット

- ファイル数が増える。特に `repo` のようなシンプルなエンドポイントでは、controller / service / domain / adapter / Dto が並んでボイラープレート的に見える
- 変換コード (ドメインモデル → DTO) が冗長に感じられる場面がある

### 規約補遺

- 既存 `RepoInfo` (common) は `RepoInfoDto` にリネームし、ドメインモデル側は `packages/api/src/domain/repo.ts` に新設する。現状は構造同型だが、型定義を別にする方針に従う
- ADR 0006 で定めた「common パッケージに型を置く」方針は維持する。ただし common に置くのは **DTO のみ** であり、ドメインモデルは置かない

## 関連

- ADR 0003: API は node:http + 自前極小ルーター (本 ADR で `http/` 配下に移動)
- ADR 0006: 型共有は common パッケージ (本 ADR で DTO 専用とする旨を明確化)
- ADR 0007: git 操作は execFile 経由 (adapter/git 配下で継承)
- ADR 0009: セキュリティ境界 (controller 層でバリデーションを行う責務を明確化)
- ADR 0010: 型安全ポリシー (ドメイン → DTO 変換で `as` 禁止を再確認)
