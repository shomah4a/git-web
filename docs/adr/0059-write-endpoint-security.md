# 0059. 書き込みエンドポイントのセキュリティ境界

## ステータス

承認

## 文脈

ADR 0057 でレビューコメントの作成・resolved 切替に POST エンドポイントを新設する。これは
git-web 初の状態変更系である。ADR 0009 §5 は「状態変更系を実装するフェーズで Origin /
CSRF 対策節を再確認する」と予告していた。本 ADR はその具体化である。

既存の防御状況:

- `server.ts` は `127.0.0.1` のみに bind し、Host ヘッダを loopback (127.0.0.1 / localhost /
  [::1]) に限定する `isHostAllowed` を持つ (DNS rebinding 対策)
- **Origin 検査は未実装**
- HTTP の `HttpRequest` は body を持たず、`handleRequest` は body を読まない (GET 専用設計)

localhost bind だけでは不十分である: 悪意ある web ページの JS は `http://127.0.0.1:<port>`
へ fetch / form POST を送れる (同一オリジンポリシーが防ぐのはレスポンスの読み取りであって
リクエストの送信ではない)。読み取り系 (GET) は実害が出にくいが、書き込み系は CSRF で
意図しない書き込みを誘発されうる。

## 決定

### 1. POST body 読み取り経路の新設 (GET 非干渉)

- `HttpRequest` に optional な `body?: string` を追加する (型上は後方互換)
- `handleRequest` は **状態変更系メソッド (POST/PUT/PATCH/DELETE) のときのみ** body を読む。
  GET / HEAD はストリームに一切触れない (`req.on('data')` を走らせない)
- body サイズに上限を設け、超過時はストリームを破棄して **413 Payload Too Large** を返す
- この分岐は http 層に閉じる。GET 経路の無回帰と「GET に body を付けても無視される」ことを
  テストで固定する

### 2. Origin ガード (状態変更系のみ)

- `isOriginAllowed(originHeader, address)` 純粋関数を追加する (`isHostAllowed` と同パターン)
- **POST のときのみ** Origin を検査し、起動時に確定した自オリジン以外は **403** を返す
- 自オリジンは Host 検査と同じ **3 表記** を許容する:
  `http://127.0.0.1:<port>` / `http://localhost:<port>` / `http://[::1]:<port>`
  (揃えないと localhost アクセス時に自分の POST が 403 になる回帰が起きる)
- **Origin 欠落も 403** とする (fail-closed)。現代ブラウザの POST fetch には Origin が付くため
  実害は小さい
- GET は Origin 検査の対象外 (既存挙動を維持)

### 3. パストラバーサル防御 (reviewsDir)

- 書き込み先ファイル名に入る `<sha>` は **40桁 hex のブランド型** (`/^[0-9a-f]{40}$/`) で
  検証してからでないと adapter の書き込み口に渡らないよう、型で保証する (ADR 0057 §2)。
  既存の `SHA_PATTERN` (4〜40桁) は流用しない
- reviewsDir は起動時に realpath 解決して固定し、書き込み先
  `resolve(reviewsDir, sha + '.jsonl')` が reviewsDir 配下にあることを確認する
  (sha 検証との二層防御 / defense-in-depth)

### 4. 責務境界 (403/413 は http 層、400 は error-mapper)

- Origin 403 と body 上限超過 413 は、ハンドラ呼び出し前に **http 層 (`server.ts`) で直接** 返す
  (例外 → HTTP マッピングの `error-mapper` は通らない)
- ドメイン検証エラー (不正な SHA / 行範囲 / 本文) は従来通りドメイン例外を throw し、
  `error-mapper` が **400** にマップする
- 「400 系は error-mapper、403/413 系は http 層」という境界をコードコメントで明記し、後続が
  error-mapper に Origin 判定を足す逸脱を防ぐ

## 結果

- CSRF / DNS rebinding に対し、bind + Host + Origin の多層で状態変更系を保護する
- 読み取り系 (GET) の挙動は一切変わらない
- 以後の状態変更系エンドポイントは本 ADR のガードを再利用する

## 関連 ADR

- ADR 0009: セキュリティ境界 (本 ADR が §5 を具体化)
- ADR 0057: 機能スコープ (POST エンドポイントの出元)
- ADR 0058: 永続化フォーマット (reviewsDir のパストラバーサル防御)
