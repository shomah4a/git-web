# 0058. レビューコメントの永続化フォーマット

## ステータス

承認

## 文脈

ADR 0057 で diff 行コメントを導入する。コメントは「何らかのフォーマットでリポジトリ内の
ファイルに保存し、外部 agent (Claude) が読んで対応する」ことが要件である。保存場所・
フォーマット・更新方式・id 採番を本 ADR で定める。

並行書き込みの安全性が論点になる: git-web は単一プロセスだが、Node のイベントループは
`await` 境界で別リクエストの処理にインターリーブしうるため、read-modify-write は
lost update を起こしうる。

## 決定

### 1. 保存場所: `.git-web/reviews/<sha>.jsonl` (コミット SHA 単位)

- リポジトリルート直下の `.git-web/reviews/` 配下に、コミット SHA ごとに 1 ファイル
- ファイル名は `<40桁SHA>.jsonl`
- reviewsDir は起動時に realpath 解決して固定し、書き込み先が reviewsDir 配下にあることを
  二層で確認する (ADR 0059, パストラバーサル防御)

外部 agent は「diff の `from..to` に含まれる SHA に対応するファイルを読む」だけでコメントを
取得できる。

### 2. コメント本体は append-only JSONL

- コメント本体ファイル `<sha>.jsonl` は **追記専用** とする
- 1 コメント = 1 行の JSON。作成時に `fs.appendFile` で **1 行を 1 回の呼び出しで** 追記する
  (複数 write に分割しない。並行追記時の行交錯を防ぐ)
- read-modify-write を行わないため、コメント本体の lost update は構造的に発生しない

### 3. resolved は別ファイルの append-only ログ

resolved のトグルでコメント本体ファイルを書き換えると read-modify-write になるため、
resolved 状態は別ファイルに分離する。

- `<sha>.resolved.jsonl` に `{ "id": <commentId>, "resolved": <bool>, "ts": <iso> }` を追記
- read 側は id ごとに **最後の行 (最新 ts) を勝ち** として畳み込む
- これにより resolved もすべて append-only で表現でき、lost update を回避する

### 4. 読み取り時の堅牢性

- 1 行ずつ JSON.parse し、**壊れた行はスキップ** する。スキップ時は `console.warn` で理由を
  ログ出力する (Zen「Errors should never pass silently」: 黙殺しない)
- ファイル / ディレクトリが存在しない場合は空として扱う

### 5. id 採番: timestamp + ランダムサフィックス

- id は作成時刻ベース (timestamp) に **ランダムサフィックス** を付与する
- 採番は副作用として `newId: () => string` を注入する (テストで固定可能)
- 純粋な timestamp のみだと同一ミリ秒で衝突し、resolved ログの id 参照が別コメントに誤適用
  されうる。ランダムサフィックスで衝突確率を下げる

### 6. 外部 agent 契約 / wire DTO との分離

- 外部 agent が読むのは `<sha>.jsonl` のコメント本体 (resolved は UI 関心事であり agent は不要)
- front↔api の wire format は `packages/common` の DTO とし、ファイル上の JSONL スキーマとは
  別型として扱う (ファイル形式の変更が wire を直接壊さないようにする)

### 7. git 追跡設定には関知しない

`.git-web/` を git 追跡対象にするか (.gitignore / .git/info/exclude) は **利用者の判断** とし、
git-web は一切操作しない。git-web はファイルを書くだけである。

## 非採用案

- **全書換 (read-modify-write)**: resolved 更新が自然になるが、並行 POST で lost update。
  append-only ログ + 畳み込みで回避する方を採る。
- **連番 id**: 読みやすいが max+1 採番に既存行 read が必要でレースを生む。
- **単一ファイル集約**: 全コメントを 1 ファイルにすると、SHA 単位の局所読み取り (外部 agent の
  「該当 SHA だけ読む」契約) が崩れる。

## 結果

- 書き込みがすべて append-only になり、並行書き込みの整合が単純化される
- 外部 agent は SHA 対応ファイルを読むだけでよい
- resolved の畳み込みロジックが read 側に必要になる (許容コスト)

## 関連 ADR

- ADR 0057: 機能スコープ (本 ADR の保存対象)
- ADR 0059: 書き込みセキュリティ境界 (reviewsDir のパストラバーサル防御)
- ADR 0009: セキュリティ境界
