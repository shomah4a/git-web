# コミット履歴ビューの追加

## セッション概要

- ブランチ: `feat/commit-log-view`
- `/commits` ルートにコミット履歴一覧ビューを追加した

### 変更内容

1. ADR 0046 を新規作成 (コミット履歴ビューの設計)
2. ドメイン層: `CommitEntry` / `CommitStats` 型、`GitLogClient` ポート
3. アダプタ層: git log パーサー (NUL/SOH 区切り)、`CliGitClient.log` メソッド
4. 共通 DTO: `CommitDto` / `CommitsResponseDto`
5. サービス層: `CommitsService`
6. コントローラ: `GET /api/commits?rev=HEAD&limit=20&after=<sha>&path=<path>`
7. フロント: `CommitsView.vue`、API クライアント、ルーター登録、History タブ追加

### 機能

- RevisionCombobox でブランチ/タグ/SHA 指定
- 20 件ずつのカーソルベースページネーション (show more ボタン)
- 各コミットから diff (`/diff?from=<sha>^&to=<sha>`) と tree (`/tree?rev=<sha>`) への導線
- パス絞り込み (`?path=src`)
- クエリストリング対応 (`?rev=main`)

### 評価結果

- 防衛的計画評価: MEDIUM 2 / LOW 2 → DTO 順序修正と format 設計の ADR 明記で対応済み
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-defensive-review.md`
- 実装安全性評価 1 回目: CRITICAL 1 / MEDIUM 2 / LOW 2
  - CRITICAL: ページネーションのカーソル処理バグ (after と rev の union 問題)
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-safety-review.md`
- 実装安全性評価 2 回目: HIGH / CRITICAL なし、LOW 2 件 (対応不要と判断)
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-safety-review-2.md`

### テスト結果

- `./bin/pnpm check`: green
  - api: 40 files / 605 tests (新規 11 tests)
  - common: 2 files / 7 tests
  - front: 17 files / 194 tests

### 計画文書

- `.claude/tmp/2026-04-21_commit-log-view.md`

## TODO

- main へのマージ
- ブラウザでの動作確認 (dev サーバー起動が必要)
- document title の対応 (useDocumentTitle に commits ルートのタイトルを追加するか検討)
