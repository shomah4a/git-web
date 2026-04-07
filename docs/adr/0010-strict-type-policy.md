# 0010. 型安全ポリシー: any / as / 非 null アサーションの禁止

## ステータス

承認済み

## 文脈

ADR 0008 で Vitest / ESLint / Prettier のツールチェインを採用することを決めたが、ESLint の具体的なルールセットは「デフォルトの recommended」にとどめていた。

プロジェクト初期のうちに「型の嘘」を全面的に禁止する運用を敷いておきたい。理由は次の通り:

- 後から既存コードを直しながら厳格化するより、最初から禁止した方が累積コストが低い
- TypeScript の旨味（静的型の保証）を最大化するには「嘘をつく手段」を塞ぐのが最も効く
- 個人ローカルツールとはいえ、将来のリファクタや機能追加時に型の網を強く張っておくメリットが大きい

ユーザーからの要請として、次の 2 点が明確化された:

1. 「any が出てきたらエラーになるくらいの強固な型チェック」にしたい
2. インターフェイス境界を越える `any` は絶対に防ぎたい。関数内で `any` から具象型に安全に narrowing できるならローカルスコープでは許容したい。Kotlin で「ローカルでは `ArrayList`、インターフェイスでは `List`」とするようなポリシーのイメージ

このうち 2 の意図は、TypeScript では `any` ではなく **`unknown`** という型で実現するのが適切である。`unknown` は「型情報のない値を受けるが、使う前に必ず narrowing する」ことをコンパイラが強制するため、関数境界を越えるときには具象型になっている保証がある。`any` は narrowing をサボっても通るため、ローカルスコープでも使わせるべきではない。

## 決定

ESLint の設定で以下を強制する。

### 1. 型認識リント (type-aware linting) を全面有効化

`tseslint.configs.recommendedTypeChecked` を適用する。これにより以下のような「暗黙の any 伝染」を検出する:

- `JSON.parse` の戻り値 (`any`) をそのまま別の場所に渡す
- any 型のプロパティアクセス / 呼び出し / 代入 / return / 引数渡し

ESLint が裏で TypeScript 型チェッカーを起動するため、`parserOptions.projectService: true` を設定する。

### 2. 字面の `any` を禁止

`@typescript-eslint/no-explicit-any` を error に（`recommendedTypeChecked` に含まれる）。

### 3. 型アサーション (`as Foo` / `<Foo>x`) を禁止

`@typescript-eslint/consistent-type-assertions` を `{ assertionStyle: 'never' }` で error に。

例外として `as const` は TypeScript の「const assertion」として扱われ、型の嘘ではないため本ルールでも許容される（typescript-eslint の仕様）。

### 4. 非 null アサーション (`x!`) を禁止

`@typescript-eslint/no-non-null-assertion` を error に。代わりに明示的な `if (x === undefined) throw ...` で narrowing する。

### 5. 禁止を破るエスケープハッチは使わない

ADR 0008 で「`eslint-disable` 系は原則禁止」としているため、本 ADR で禁止したルールを個別に無効化することもできない。違反が出たら修正で対応する。

### 6. 代替手段の指針

- **ローカルで「型を書きたくない」** → 型推論に任せる（TypeScript はほとんどのケースで正しく推論する）
- **リッチな内部型 + 絞った外部インターフェイス** → 具象型同士で内外を切る（Kotlin の ArrayList/List と同じ構図）
- **外部入力（HTTP body, JSON, 子プロセス出力など）** → `unknown` で受けて型ガード関数または runtime validator で narrowing する
- **runtime validator** → 必要になった段階で zod など外部ライブラリの導入を別 ADR で検討する

## 結果

- `any` と `as` と `!` が全面的に禁止される
- 外部入力を扱うコードは `unknown` で受けて明示的に narrowing する必要がある
- 型チェックの実行時間は増えるが、現在の規模では体感できないレベル
- 既存コード（common と api パッケージのスケルトン）には違反なし
- `packages/*/tsconfig.json`（テストを含む）と `packages/*/tsconfig.build.json`（テストを除外、`tsc -b` で emit）に分離する。ESLint は前者を projectService 経由で参照する
- 将来的に runtime validator（zod など）の導入が必要になったら別 ADR として起票する
