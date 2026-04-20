# ADR 0045: git-web の shutdown は graceful を放棄し即時 exit する

## ステータス

承認

## コンテキスト

`bin/git-web` の SIGINT / SIGTERM ハンドラは ADR 0044 導入以前から `await started.close()` を行うことで graceful shutdown を試みていた。

しかし `node:http.Server.close()` は idle な keep-alive 接続が残っている限り callback を発火しない。ブラウザで SPA を開いたまま Ctrl-C を押すと、ブラウザが握っている idle keep-alive 接続が原因で `close()` が永遠に resolve せず、SIGINT ハンドラが登録されているため Node のデフォルト終了も起きず、プロセスが Ctrl-C で落ちない状態となっていた。

検討した graceful 化の補強策:

- `server.closeIdleConnections()` を `close()` に組み込んで idle 接続を強制破棄する
- `shutdown()` に全体タイムアウト（例: 3s）を入れてタイムアウト時に `process.exit(0)` する
- 二段階 Ctrl-C（1 回目 graceful、2 回目 force exit）

いずれも graceful でありたいという前提を維持するためのもので、複雑さとエッジケースを増やす方向に倒れる。

そもそも graceful が何をもたらすかを問い直すと:

- ブラウザへの TCP FIN（相手はローカル上の自分のブラウザのみ）: ブラウザは RST でも問題なく再接続できる
- in-flight レスポンスの完走: ローカルの API、相手はブラウザのみ、Ctrl-C は明示的な終了意思表示であり、半端なレスポンスが切れても実害はない
- レジストリエントリのクリーンアップ: `unregisterSync` で同期完了できる。さらに異常終了で漏れた場合も ADR 0044 の `pruneStale` が次回起動時に自己修復する

つまり graceful 化の実益はローカル専用 CLI では存在しない。不要な graceful を維持するために発生した複雑度が Ctrl-C ハングという実障害を生んだ構図である。

## 決定

`bin/git-web` の SIGINT / SIGTERM ハンドラは graceful shutdown を放棄し、以下の最小処理のみ行う:

```javascript
const shutdown = () => {
  result.unregisterSync()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

- `await result.close()` を呼ばない。HTTP サーバの socket は OS によって回収される
- `await result.unregister()` も呼ばない。同期版 `unregisterSync` で十分
- `process.on('exit')` での `unregisterSync` 登録は保険として維持する（`unregistered` フラグで idempotent）

`packages/api/src/http/server.ts` の `close()` 関数は変更しない。launcher のコンフリクト経路（`lifecycle/launcher.ts:149`）では listen 直後で idle / in-flight 接続が存在せず graceful close が健全に機能するため、そのまま使える。

## 根拠

- ローカル専用 CLI では graceful shutdown の実益が無い
- graceful の正しさを担保するコストがバグの温床になる実績がある（本件）
- `pruneStale` が既に存在するため、レジストリ整合性は最終的に保証される
- 対処としても最小差分（`bin/git-web` の数行）で済む

## 非採用案

### closeIdleConnections() を close() に組み込む

- idle 接続は蹴れるが in-flight が残る状態で close callback が待つ
- launcher コンフリクト経路では in-flight の可能性がわずかに残る（H-1）
- graceful を維持するためだけの追加複雑度

### shutdown() に全体タイムアウトを入れる

- 「どの経路でも最大 3s で落ちる」保証は作れる
- ただしそもそも graceful を放棄すれば即時 exit 可能であり、タイムアウトは不要

### 二段階 Ctrl-C（1 回目 graceful、2 回目 force exit）

- graceful を維持する方針とセットの対策
- graceful 放棄により不要

### server.keepAliveTimeout を短くする

- 常時パフォーマンスに悪影響
- 問題の本質解決にならない

## 影響範囲とプラットフォーム

- `bin/git-web` の shutdown 実装のみ変更
- `server.ts` / `launcher.ts` / `main.ts` は無改変
- 対応プラットフォーム: Linux / macOS / WSL。Windows ネイティブでのシグナル挙動は未検証（既存と同じ）

## 関連

- ADR 0044: 複数インスタンスレジストリ（`unregisterSync` と `pruneStale` の由来）
