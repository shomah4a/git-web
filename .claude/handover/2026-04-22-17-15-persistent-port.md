# レジストリによるリポジトリ別ポート永続化

## セッション概要

- ブランチ: `feature/persistent-port`
- レジストリのエントリをプロセス終了時に削除せず永続化し、再起動時に前回のポートを再利用する機能を実装した

### 変更内容

1. ADR 0049 を作成、ADR 0044 にリンクを追記
2. `registry.ts`: `pruneStale` / `removeEntry` を削除、`collectUsedPorts` を追加
3. `launcher.ts`: フロー変更
   - stale エントリ → 前回ポートで起動、EADDRINUSE なら port=0 フォールバック
   - 新規起動 → port=0 で OS 割当、レジストリ内既存ポートと重複したら 1 回リトライ
   - `options.port`（PORT 環境変数）が指定されていれば最優先で使用
   - `unregister` / `unregisterSync` を廃止
4. `registry-io-node.ts`: `readRegistrySync` / `writeRegistrySync` を削除
5. `main.ts`: `syncRegistry` 関連削除、`start()` の listen 失敗時に `server.close()` 追加
6. `bin/git-web`: unregister 関連削除、シグナルハンドラ簡素化

### テスト結果

- `./bin/pnpm check`: green (API 605件、front 214件、common 7件)

### 評価結果

- 実装安全性評価: HIGH 1件（PORT 環境変数の無視 → 修正済み）、LOW 2件（対応不要）
  - 全文: `.claude/tmp/2026-04-22_persistent-port-safety-review.md`

## TODO

- main へのマージ
- 目視確認（dev サーバーでの動作確認: 起動 → 停止 → 再起動でポートが維持されるか）
- 既存 TODO（申し送り 2026-04-22-11-20）の継続:
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
