# ADR 0044: 複数リポジトリ同時起動とインスタンスレジストリの導入

## ステータス

承認（ただし「終了時の unregister」セクションの SIGINT/SIGTERM 経路の async close 方針は ADR 0045 で撤回）

## コンテキスト

ADR 0013 では `bin/git-web` のデフォルトポートを `47906` に固定し、URL 再現性（ブックマーク可能）と衝突確率のトレードオフを許容する判断を行った。

実運用を経て以下の不便が顕在化した:

1. 複数リポジトリで同時に `git web` を起動できない（ポートが衝突して後発が起動失敗する）
2. 同一リポジトリで `git web` を再実行するたびに新インスタンスが立ち上がり、既存プロセスが放置される（ユーザは毎回どのプロセスが生きているか把握できない）

URL 再現性を維持したまま両方を解決するのは難しい。URL 再現性よりも上記 2 点の実用性を優先する。

## 決定

### デフォルトポートは OS 自動割当（port 0）

`bin/git-web` のデフォルト挙動を「`PORT` 未指定なら port 0 を指定して `start()` を呼ぶ」に変更する。実際の待ち受けポートは OS が空きポートから割当てる。

- `PORT` 環境変数を指定した場合は引き続きその値を使う（固定ポートでの運用が可能）
- 127.0.0.1 bind は継続（ADR 0009）
- bind 失敗時は従来通りエラー終了する

### インスタンスレジストリの導入

`$XDG_STATE_HOME/git-web/instances.json` にファイルベースのレジストリを置く。

- パス解決順:
  1. `$XDG_STATE_HOME`（定義されていれば `${XDG_STATE_HOME}/git-web`）
  2. Windows native のみ `%LOCALAPPDATA%/git-web`
  3. fallback: `~/.local/state/git-web`
- ディレクトリ `mode 0o700`、ファイル `mode 0o600`
- 一次サポート: Linux / macOS / WSL。Windows native は best-effort

スキーマ:

```json
{
  "version": 1,
  "instances": {
    "<realpath-repoRoot>": {
      "port": 41234,
      "pid": 12345,
      "url": "http://127.0.0.1:41234",
      "startedAt": "2026-04-19T00:00:00.000Z"
    }
  }
}
```

キーは `realpath` 済みの絶対 repoRoot パス。trim して改行を除去する。

### 起動フロー

1. `CliGitClient(cwd).repoRoot()` → `realpath` で正規化
2. レジストリをロード（壊れていたら警告して空扱い＝自己修復）
3. 同一 repoRoot のエントリを live 判定
   - `process.kill(pid, 0)` で存在確認（OS 上に PID が残っているか）
   - 追加で `GET <url>/api/repo` に 500ms タイムアウトでヘルスチェック（PID reuse による誤判定の対策）
   - 両方成功なら live → URL を stdout に出力しブラウザを開いて exit 0（`start()` は呼ばない）
   - いずれか失敗なら stale → レジストリから削除して新規起動へ進む
4. `start({ cwd, staticDir, port })` で新規起動し、成功したらレジストリに自エントリを書き込む

### 書き込み競合対策

レジストリ書き込み window のみ `instances.json.lock` を `wx` フラグで排他作成する（短期ロック）。lock ファイルには自 PID を書き込む。

ロック取得に失敗（EEXIST）した場合は lock ファイルの holder PID を読み、

- holder が生きている（自 PID でも同様）: 50ms 待ってリトライ（最大 10 回）
- holder が死んでいる / PID がパースできない: stale として即座に `unlink` し、リトライ

これにより SIGKILL などで lock ファイルが残っても次回起動時に自動回復する。

ファイル本体の書き込みは一時ファイル `instances.json.<tmp>` に書いてから `rename` でアトミック置換する。

完全なプロセス間排他ではなく、通常の起動タイミングの競合を緩和するのが目的。極端なレースで複数インスタンスが同一 repoRoot に登録される可能性は残るが、その場合は次回起動時の live 判定 + stale prune で回収される。

### 終了時の unregister

- SIGINT / SIGTERM および正常完了経路では async で `close()` → レジストリから自エントリ削除まで完走させる
- `process.on('exit')` は保険として `writeFileSync` ベースの同期 unregister を試みる。失敗しても次回起動時の live 判定 + stale prune が最後の砦となる設計にする

> 注: 本節の「SIGINT / SIGTERM 経路で async な `close()` → async な unregister を完走させる」方針は ADR 0045 により撤回された。
> `bin/git-web` の SIGINT / SIGTERM ハンドラは同期 `unregisterSync` + `process.exit` のみを行う。async な `close()` / `unregister()` は launcher のコンフリクト経路など別プロセスが先にレジストリを押さえたときの自サーバ畳み込みでのみ使う。

### Dev サーバー運用との整合性

`packages/front/vite.config.ts` の proxy target は `127.0.0.1:47906` のまま維持する。dev サーバーで API をプロキシする際は `PORT=47906 ./bin/git-web` と明示指定する運用を継続する（README.md の開発手順で既に指示済み）。

## 根拠

- URL 再現性は「毎回 URL が変わるのは不便」という直感に反するが、実際には `bin/git-web` は CLI から都度起動するツールであり、立ち上げと同時にブラウザを自動で開くためユーザが URL を直接入力する場面はほぼない
- レジストリで「同一 repoRoot の重複起動を抑止しつつ既存インスタンスへ誘導する」挙動を実現すれば、ユーザ体験は「前回立てたウィンドウに戻る」で一貫する
- ブックマークや固定 URL が必要な用途には `PORT=<固定値>` 経由での明示指定を残す
- HTTP ヘルスチェックは PID reuse 誤判定を実用上無害化するために入れる。500ms タイムアウトは遅すぎない範囲で TCP 接続 + HTTP レスポンス 1 往復に十分

## 影響

- `make serve` は毎回異なる URL を出力するようになる
- 複数リポジトリでの並行起動が可能になる
- 同一リポジトリで `git web` を再実行しても 2 つ目のプロセスは立ち上がらず、既存 URL へブラウザが飛ぶ
- レジストリファイルが壊れた場合は警告出して空として扱い、起動自体は継続する
- ユーザホーム配下に `~/.local/state/git-web/` が作られる

## 関連

- ADR 0009: セキュリティ境界（127.0.0.1 bind 維持）
- ADR 0013: dev サーバー構成（本 ADR でデフォルトポート固定の判断を撤回）
