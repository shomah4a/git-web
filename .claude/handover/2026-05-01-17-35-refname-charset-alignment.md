# refname 許可文字を git 仕様に合わせる

## セッション概要

- ブランチ: `fix/revision-refname-charset`
- ブランチ名に `+` を含むケースで表示できない問題の報告を受けて調査
- フロントエンドの URL エンコードは問題なし（`URLSearchParams` が適切に処理）
- バックエンドの `REFNAME_BODY_PATTERN` が git `check-ref-format` より狭い許可文字だったことが原因
- `+` だけでなく `@`, `!`, `#`, `%`, `,`, `=` も git 仕様上合法だが拒否されていたため、合わせて修正
- 単独 `@` は git の HEAD エイリアスであり、リビジョン指定として合法なので拒否しない方針とした

### 変更内容

1. ADR 0051 作成（refname 許可文字の git 仕様合わせ）
2. ADR 0018 にリンク追記
3. `packages/api/src/domain/revision.ts`: `REFNAME_BODY_PATTERN` に `+@!#%,=` を追加
4. `packages/api/src/domain/revision.test.ts`: 各文字のテストケース追加

### テスト結果

- `./bin/pnpm check`: green (API 618件、front 239件、common 7件)

### 評価結果

- 防衛的計画評価: `.claude/tmp/2026-05-01_revision-plus-sign-defensive-plan-review.md`
- 実装安全性評価: HIGH/CRITICAL なし、LOW 2件（対応不要）
  - 全文: `.claude/tmp/2026-05-01_refname-charset-safety-review.md`

## TODO

- main へのマージ
- 既存 TODO（申し送り 2026-04-27-18-50）の継続:
  - テンプレート内 `getGaps()` の重複呼び出し（パフォーマンス）
  - 展開行の左右スクロール同期未設定
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
