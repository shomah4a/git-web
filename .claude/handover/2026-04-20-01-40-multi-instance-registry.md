# 複数リポジトリ同時起動とインスタンスレジストリの導入

## セッション概要

- `git web` のデフォルトポート固定 (47906) を撤回し、OS 自動割当 (port 0) + リポジトリごとのレジストリ管理に切り替えた
- ブランチ: `feat/multi-instance-registry`
- ADR 0044 として設計決定を記録、ADR 0013 のステータス行に撤回リンクを追記

### 変更内容

1. ADR 0044 を新規作成
2. `packages/api/src/lifecycle/registry.ts` を追加: レジストリ I/O と live 判定の純粋ロジック（副作用を引数注入）
3. `packages/api/src/lifecycle/registry-io-node.ts` を追加: Node ランタイム向け実装（XDG_STATE_HOME 解決、`wx` lock、atomic rename、HTTP ヘルスチェック、同期版 reader/writer）
4. `packages/api/src/lifecycle/launcher.ts` を追加: registry と `start()` を束ねる `launch()`。同一 repoRoot の live エントリ検出時は `{ kind: 'existing' }` を返し、それ以外は起動 + 登録で `{ kind: 'started', unregister, unregisterSync, close }` を返す
5. `packages/api/src/main.ts` に `launch()` を追加（既存 `start()` は未変更）
6. `bin/git-web` を `launch()` 経由に書き換え、SIGINT/SIGTERM + `process.on('exit')` でレジストリから抜ける処理を追加
7. README / vite.config.ts / ADR 0013 を ADR 0044 に整合させて更新

### 手動動作確認（完了）

- 同一リポジトリ重複起動抑止: OK（既存 URL を stdout に出してブラウザ起動後 exit 0）
- 別リポジトリ並列起動: OK（異なる空きポートで並走、両方とも /api/repo に応答）
- SIGINT 正常終了: OK（レジストリから抜ける）
- SIGKILL 後の再起動: OK（stale prune が走り新規起動）
- 破損レジストリ: OK（警告出して空扱い、起動成功）
- PORT=55555 明示: OK（指定ポートでバインド、レジストリ登録）
- dir 0o700 / file 0o600: OK

### 安全性評価

- CRITICAL / HIGH なし（リリース可）
- MEDIUM: `shutdown` の二重呼び出しガード / `readPortFromEnv` の重複実装
- LOW: `nodeHttpCheck` のホスト名ホワイトリスト / launcher の prune コメント
- 詳細: `.claude/tmp/2026-04-19_multi-instance-registry-safety-review.md`

### 全テスト結果

- `./bin/pnpm check`: green
  - api: 38 files / 586 tests passed（新規 46 tests 追加）
  - common: 2 files / 7 tests
  - front: 17 files / 194 tests

## TODO

- MEDIUM 指摘への対応方針をユーザーに確認
  - `bin/git-web` の shutdown に idempotent ガード
  - `readPortFromEnv` を api 側に寄せて bin から import
- LOW 指摘への対応方針をユーザーに確認
  - `nodeHttpCheck` のホスト名ホワイトリスト
- main へのマージ
