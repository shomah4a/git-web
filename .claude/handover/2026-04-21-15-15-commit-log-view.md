# コミット履歴ビューの追加

## セッション概要

- ブランチ: `feat/commit-log-view`
- `/commits` ルートにコミット履歴一覧ビューを追加した

### 変更内容

1. ADR 0046 を新規作成 (コミット履歴ビューの設計)
2. ドメイン層: `CommitEntry` / `CommitStats` 型 (parentCount 含む)、`GitLogClient` ポート
3. アダプタ層: git log パーサー (NUL/SOH 区切り、%P で親ハッシュ、%at で UNIX epoch)、`CliGitClient.log` メソッド
4. 共通 DTO: `CommitDto` / `CommitsResponseDto` (parentCount, date: number)
5. サービス層: `CommitsService`
6. コントローラ: `GET /api/commits?rev=HEAD&limit=20&after=<sha>&path=<path>`
7. フロント: `CommitsView.vue`、API クライアント、ルーター登録、History タブ追加

### 機能

- RevisionCombobox でブランチ/タグ/SHA 指定 + 適用ボタン
- 20 件ずつのカーソルベースページネーション (show more ボタン)
- 各コミットから diff (`/diff?from=<sha>^&to=<sha>`) と tree (`/tree?rev=<sha>`) への導線
- マージコミット判定: parentCount >= 2 で Type カラムに merge バッジ表示
- 日時: UNIX タイムスタンプ (タイムゾーン独立) → ブラウザ側でローカル時刻 + オフセット表示
- パス絞り込み (`?path=src`)
- クエリストリング対応 (`?rev=main`)
- テーブルヘッダの sticky 固定

### 修正した問題

- ページネーションのカーソル処理: after と rev の union 問題 → `after~1` 単独起点に修正
- リビジョン切替時のデータ再読み込み: router.push のみに依存 → 直接 loadCommits を呼ぶように修正
- 適用ボタン未実装 → RevisionTreeView と同パターンで追加
- 日時のタイムゾーン依存: %aI (ISO+offset) → %at (UNIX epoch) に変更

### 評価結果

- 防衛的計画評価: MEDIUM 2 / LOW 2
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-defensive-review.md`
- 実装安全性評価 1 回目: CRITICAL 1 / MEDIUM 2 / LOW 2
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-safety-review.md`
- 実装安全性評価 2 回目: HIGH / CRITICAL なし、LOW 2 件 (対応不要と判断)
  - 全文: `.claude/tmp/2026-04-21_commit-log-view-safety-review-2.md`

### テスト結果

- `./bin/pnpm check`: green
  - api: 40 files / 606 tests
  - common: 2 files / 7 tests
  - front: 17 files / 194 tests

### ブラウザ動作確認

- ユーザーによる確認済み

### 計画文書

- `.claude/tmp/2026-04-21_commit-log-view.md`

## TODO

- main へのマージ
- document title の対応 (useDocumentTitle に commits ルートのタイトルを追加するか検討)
