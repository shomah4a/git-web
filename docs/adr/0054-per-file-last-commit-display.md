# 0054. ツリービューでのファイル単位最終コミット表示

## ステータス

承認済み

## 文脈

GitHub のリポジトリビューと同様に、`RevisionTreeView` のテーブルに「ファイルごとの最終コミット日 / メッセージ」を表示したい。

既存実装では `/api/tree` がエントリ一覧 (name / type / status / mode / size) を返すのみで、コミット情報は持たない。最終コミット情報は `git log` のスキャンが必要であり、エントリ数に比例した処理時間がかかる。

相対時刻表示 (例: "3 days ago") は採用せず、`YYYY-MM-DD` 形式の絶対日付で表示する。worktree (rev=null) 表示時の未コミット変更は既存の `Status` 列 (A/M/D/U) で表現できているので、本機能は「最終コミット情報の表示」に集中する。

## 決定

### 1. 専用エンドポイントを分離する

新規エンドポイント `GET /api/tree-commits?rev=<rev>&path=<dir>` を設ける。`/api/tree` は変更しない。

理由:

- ツリー取得 (高速) とコミットスキャン (低速) のレスポンス時間特性が大きく異なる。一体化すると初期描画が遅延する
- フロントは tree を先に描画し、commits は遅延フェッチで列を埋める UX を採用する
- 既存 `/api/tree` のテスト・契約に影響を与えない

### 2. git コマンド

```
git -c core.quotePath=true log
  -m --first-parent
  --format=%x00%H%x01%ct%x01%s%x01
  --name-only --no-renames
  --max-count=<LIMIT>
  --end-of-options <rev>
  -- <dir>/         # path === '' のときは '--' 以降を省略
```

採用フラグの根拠:

- `-m --first-parent`: マージコミットで `--name-only` がデフォルトで空になるため `-m` を付け、かつ first-parent 側のみで diff を生成する。GitHub の「マージで取り込まれた日が最終更新」という挙動に最も近く、計算量も first-parent で抑制できる
- `--format=%x00%H%x01%ct%x01%s%x01`: ADR 0046 と同じく NUL レコードセパレータ・SOH フィールドセパレータ。末尾 `%x01` は subject と続く name-only ブロックの境界マーカとする
- `--name-only`: 各コミットが変更したファイル一覧を取得
- `--no-renames`: rename 追跡は本 ADR スコープ外とし、rename 直後のファイルは履歴未確定として `null` を返す
- `--max-count=<LIMIT>`: 暴走防止。**初期値は 1000 とし、運用で見直す**。実測値: 本リポ (339 コミット) のリポルートに対する full scan で、コールド時 ~150ms / ホット時 ~40ms。339 件規模なら max-count に依らず即終了する。大規模リポ (数万コミット) で過小と分かった時点で再設定する
- `-c core.quotePath=true`: ファイル名内の非 ASCII 文字を C-style クォートさせ、ユーザー gitconfig の `core.quotePath` 設定に依存しないようにする
- `--end-of-options <rev>`: ADR 0018 の二層防御を踏襲

### 3. パーサ

`packages/api/src/adapter/git/tree-commits-parser.ts` を新設。stdout を以下の二段で分解する:

1. `\x00` で全レコード分割
2. 各レコードを `\x01` で `[hash, ct, subject, name-only-block]` の 4 フィールドに分割
3. `name-only-block` を改行分割しトリム → ファイルパス配列

行頭 NUL 判定方式は採用しない (CR/LF・末尾改行で誤判定する)。

### 4. ディレクトリの「最終コミット」の定義

ディレクトリの最終コミットは「配下のいずれかのファイルが変更された最新の (`-m --first-parent` ベースの) コミット」とする。GitHub と同じ挙動。

集計手順:

1. 対象ディレクトリ配下のエントリ一覧 (`TreeService.getTree`) から `targetNames: Set<string>` を作る
2. 上記 git コマンドで新しい順に走査
3. 各コミットの変更ファイルパスを `<dir>/<name>(/...)?` の最初のセグメント `<name>` に正規化し、未確定の `targetNames` に割り当てる
4. 全 `targetNames` 確定で早期終了
5. `--max-count` 到達時の未確定エントリは `lastCommit: null`

### 5. パスとファイル名の限界

- パスは `core.quotePath=true` でクォートされた状態で照合する
- 非 ASCII / 改行を含むファイル名は、クォート展開せずに比較するためマッチしない場合があり、その場合は `lastCommit: null` となる
- 完全対応は本 ADR スコープ外
- **submodule (gitlink, mode 160000) は本機能の対象外**。既存 `ls-tree-parser` が gitlink エントリを捨てる仕様を継承しており、`TreeService.getTree` の結果に submodule は含まれない。よって `targetNames` にも入らず `/api/tree-commits` でも返さない。submodule 表示自体は将来の別 ADR で扱う

### 6. worktree (rev=null) / 空リポの扱い

- `rev` 省略時は内部的に `HEAD` を rev として `git log` を呼ぶ
- 1 コミットもない空リポなど HEAD が解決できない場合は、全エントリ `lastCommit: null` で正常応答する
- 未追跡ファイル (`Status === '?'`) は履歴に出ないため自然に `lastCommit: null` になる。UI では `—` 表示する

### 7. ドメイン port

新規 port `GitTreeCommitsClient` を切る。

```typescript
export type LastCommitInfo = {
  readonly hash: string
  readonly date: number // UNIX epoch 秒
  readonly subject: string
}

export interface GitTreeCommitsClient {
  lastCommitsByName(
    rev: Revision,
    dir: string,
    targetNames: ReadonlySet<string>,
    maxCount: number,
  ): Promise<ReadonlyMap<string, LastCommitInfo>>
}
```

トレードオフ:

- `GitLogClient.log` に統合するほうが port 数は抑えられる
- ただし `log` は構造化リクエスト/レスポンス + numstat 用パーサに最適化されており、`--name-only` の出力形式・ユースケース (集合演算と早期終了) が大きく異なるため、独立 port のほうがテスタビリティ・読みやすさが上回ると判断した
- 将来統合し直す余地は残す

### 8. DTO

```typescript
type TreeCommitDto = {
  readonly name: string
  readonly lastCommit: {
    readonly hash: string
    readonly date: number
    readonly subject: string
  } | null
}

type TreeCommitsResponseDto = {
  readonly entries: ReadonlyArray<TreeCommitDto>
}
```

時刻はコーディング規約 070 に従い UNIX epoch 秒 (TZ 独立) で渡し、フロントで表示形式に変換する。

### 9. フロント表示

- 列順: Name / Status / Last commit message / Last commit date / Mode / Size
  - Mode / Size は本リポ独自の補助情報なので右端寄せ
- 日付フォーマット: `YYYY-MM-DD` (ブラウザのローカル TZ)
- 列幅: メッセージ列は CSS `text-overflow: ellipsis` で省略
- 遅延フェッチ: tree 表示後に commits を発火し、別 ref の `Map<name, LastCommitInfo>` に格納してテンプレ側で結合
- 取得失敗時はコンソール warn のみ。tree 自体の表示は維持。コミット列は `—`

### 10. ADR 0046 との表示形式差異

ADR 0046 のコミット履歴ビューは「ローカル TZ + オフセット表示 (時刻精度)」を採用している。本 ADR は「ローカル TZ + `YYYY-MM-DD` (日付精度)」とする。

ツリービューでは「いつ更新されたか」の粒度を日付で示すのが GitHub 含む慣行に合致し、時刻まで出すと情報過多。コミット履歴ビューでは個々のコミットを識別するため時刻精度が必要。**用途差による意図的な使い分け** とし、`The Zen of Python: There should be one obvious way to do it` への抵触は許容する。

### 11. キャッシュ

V1 ではサーバ側キャッシュなし。同じ rev × dir の繰り返しリクエストが顕在化したら LRU 等を再検討する (将来課題)。

## 結果

### メリット

- ツリービューで「最後にいつ・誰が・何のために変更したか」が一目で分かる UX に近づく
- tree と commits を分離することで初期描画が遅延しない
- パーサ・port を独立させることで既存 commits ビューに影響しない

### デメリット

- 巨大履歴を持つリポでは `git log` スキャンが遅くなる (max-count で打ち切るが、その場合一部エントリが `—` になる)
- 非 ASCII / 改行を含むファイル名は `—` になりうる (現実的な制約)
- port 数が 1 つ増える

## 関連

- ADR 0011: api パッケージのレイヤ構造 (本 ADR の port / service / controller 配置の根拠)
- ADR 0018: revision 引数の二層防御 (`--end-of-options` 採用)
- ADR 0022: tree ビュー (本 ADR が拡張対象)
- ADR 0046: コミット履歴ビュー (時刻精度の表示方針との差異を §10 で記述)
- 070-coding-rules.md: 時刻の扱い (UNIX epoch 秒 + 表示時にローカル TZ 変換)
