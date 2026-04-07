# 0008. テスト・Lint・Formatter のツールチェインを Vitest / ESLint / Prettier で構成する

## ステータス

承認済み

## 文脈

プロジェクト初期から品質担保の仕組みを入れておきたい。ユーザー方針として:

- ESLint の警告抑制（`eslint-disable*`）は一切許可しない
- フォーマッタはエラーなく適用されることがコミット可能条件

候補:

- テスト: Vitest / Jest / node:test
- Linter: ESLint / Biome / oxlint
- Formatter: Prettier / Biome / dprint

## 決定

- **テスト**: Vitest（全パッケージ）
- **Linter**: ESLint flat config (`eslint.config.js`) + `@typescript-eslint` + `eslint-plugin-vue`
- **Formatter**: Prettier
- **集約**: ルート `package.json` の `pnpm check` で `lint + format:check + typecheck + test` を一括実行

理由:

- Vitest は Vite と同系統で `vite.config.ts` の設定が共有でき、Vue コンポーネントテストに `@vue/test-utils` がそのまま使える
- node:test は標準だが、Vue の SFC テストとの統合や mock API が薄い
- ESLint は依然デファクトで、Vue 3 / TS のサポートが厚い。Biome は速いが Vue 対応がまだ手薄
- Prettier は ESLint との責務分離（フォーマット = Prettier、コード品質 = ESLint）を守ることで `eslint-config-prettier` 経由で衝突を避ける

ルール:

- ESLint の警告抑制（`eslint-disable`、`@ts-ignore` 等）は原則禁止。例外は ADR を別途起票する
- `pnpm check` がコミット可能条件
- 各パッケージで最低 1 ケースの単体テストを置き、テストが動く状態を初期から維持する

## 結果

- 初期からテスト・Lint・Format が回る基盤が整う
- 警告抑制を許さないことで、ルール違反は即座に修正圧力がかかる
- ツール選定の見直しが必要になった場合は新規 ADR で置き換える
