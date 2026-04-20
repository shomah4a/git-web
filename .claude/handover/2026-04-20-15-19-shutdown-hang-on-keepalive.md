# Ctrl-C で git-web が落ちない問題の修正

## セッション概要

- ブランチ: `fix/shutdown-hang-on-keepalive`
- 症状: ADR 0044 導入後、`./bin/git-web` をブラウザで開いた状態で Ctrl-C しても落ちないケースがあった
- 原因: `bin/git-web` の SIGINT ハンドラが `await result.close()` していたため、`node:http.Server.close()` が in-flight リクエストや一部の keep-alive 接続で resolve せずハング
- 対処方針: ローカル専用 CLI なので graceful shutdown を放棄し、同期 unregister + 即時 exit に縮小（ADR 0045）

### 変更内容

1. ADR 0045 を新規作成（graceful 放棄の決定、非採用案の根拠、exit code 方針）
2. ADR 0044 のステータス行と「終了時の unregister」セクションに ADR 0045 への誘導を追記
3. `bin/git-web` の shutdown を同期化
   - `await result.close()` / `await result.unregister()` を撤去
   - `SIGNAL_EXIT_CODES: Record<'SIGINT' | 'SIGTERM', number> = { SIGINT: 130, SIGTERM: 143 }` マップに基づく exit（POSIX 慣習）
   - `process.on('exit')` の `unregisterSync` は保険として維持（コメントを「SIGKILL 等では走らない。pruneStale で回収」に修正）
4. `packages/api/src/shutdown-integration.test.ts` を新規作成
   - `bin/git-web` を子プロセスで spawn
   - keep-alive 接続を保持した状態で SIGINT を送り、3s 以内に exit code 130 / signal null で終了することを検証
   - dist 未ビルド環境では skip

### 手動動作確認

- keep-alive 接続保持中の SIGINT: 110ms で exit、`$?` = 130、レジストリ空にクリーン
- keep-alive 接続保持中の SIGTERM: 110ms で exit、`$?` = 143、レジストリ空にクリーン

### テスト結果

- `./bin/pnpm check`: green
  - api: 39 files / 594 tests（新規 1 test）
  - common: 2 files / 7 tests
  - front: 17 files / 194 tests

### 評価結果

- 防衛的計画評価: HIGH 1 / MEDIUM 4 / LOW 3 → ユーザーに相談し graceful 放棄方針で再設計し消化
  - 全文: `.claude/tmp/2026-04-20_shutdown-hang-defensive-review.md`
- 実装安全性評価 1 回目: HIGH 2 / MEDIUM 5 / LOW 3
  - 全文: `.claude/tmp/2026-04-20_shutdown-hang-safety-review.md`
  - HIGH 2 件（ADR 0044 被参照リンク未追記 / exit code 慣習違反）+ MEDIUM 3 件（テスト PATH / 閾値 / exit コメント）を対応
- 実装安全性評価 2 回目: HIGH / CRITICAL なし、LOW 3 件（exit code マップ化 / JSDoc / signal 検証）
  - 全文: `.claude/tmp/2026-04-20_shutdown-hang-safety-review-2.md`
  - LOW 3 件すべて取り込み済み

### 計画文書

- `.claude/tmp/2026-04-20_shutdown-hang-on-keepalive.md`

## TODO

- main へのマージ
- Node 22+ の `http.Server.close()` が idle keep-alive を内部で閉じることへの変更（Node 19+ の内部改善）を確認できたので、ユーザーが最初に遭遇した「落ちない」ケースはブラウザ keep-alive ではなく in-flight 長命リクエスト（大きめの blob 読み込み中など）と推測される。必要なら将来 chunked response 中の SIGINT 再現テストを追加
