# 0018. リビジョン指定の拡張と refs 一覧 API

## ステータス

承認済み (タスク A: API 側のみを対象とする。フロント側 UI は別 ADR で扱う予定)

## 文脈

> **注**: 本 ADR の refname 許可文字は ADR 0051 で git `check-ref-format` 仕様に合わせて拡張された。

ADR 0012 §5 の初版 `Revision` 許可形式は SHA / `HEAD` / `HEAD~N` / `HEAD^N` に限定しており、ブランチ名・タグ名・`refs/heads/...` 形式を明示的に拒否していた。また ADR 0009 §1 で将来計画とされていた `GET /api/refs` は未実装だった。

ユーザーからの要望により、diff 画面上で from / to を指定できるようにする。その前提として:

1. from / to にブランチ名・タグ名を書けるようにしたい
2. `HEAD^^`, `HEAD~3`, `main~3`, `feature/foo^2` のような相対修飾付きも書けるようにしたい
3. フロントが入力を絞り込んで候補を出せるよう、ブランチ/タグ一覧を返すエンドポイントが要る
4. 候補の絞り込みはクライアント全件キャッシュではなく、入力文字列をサーバに渡して絞り込む (フィルタ API 化)

本 ADR はそのバックエンド側変更を定める。フロントエンド側 UI 設計は後続 ADR (0019 予定) で扱い、本 ADR には含めない。

## 決定

### 1. Revision 許可形式の拡張

ADR 0012 §5 の許可リストを次の文法に置き換える。

```
revision  := sha | named
sha       := [0-9a-f]{4,40}
named     := base modifier*
base      := "HEAD" | refname
refname   := [A-Za-z0-9_.] [A-Za-z0-9_./-]{0,254}
modifier  := "^" | "^" digit | "~" digit{1,3}
```

追加制約 (`refname` に対して):

- 先頭が `-` / `/` で始まらない
- 連続スラッシュ `//` を含まない
- `..` を含まない
- `@{` を含まない
- 末尾が `/` でない
- 末尾が `.lock` でない
- 制御文字 (`\u0000`〜`\u001f` / `\u007f`) を含まない
- 全体長 1〜255 文字

追加制約 (`modifier` に対して):

- `^N` の N は 0〜9 (桁数 1)
- `~N` の N は 0〜999 (桁数 1〜3)

この文法により次の入力が受理される:

- `main`, `feature/foo`, `v1.0.0`, `release-1.2`
- `refs/heads/main`, `refs/tags/v1.0.0` (内部スラッシュは許容)
- `HEAD`, `HEAD^`, `HEAD^^`, `HEAD^^^`, `HEAD^2`, `HEAD~1`, `HEAD~10`
- `main~3`, `feature/foo^2`, `v1.0.0^`

次の入力は引き続き拒否される:

- 空文字列
- `HEAD@{N}` (reflog 形式、非ゴール)
- `-flag`, `/abs`, `..`, `HEAD;`, `HEAD$()`, NUL バイト混入
- `HEAD~1000` (桁数超過), `HEAD^10` (桁数超過)
- `refs/heads/main.lock`

#### ADR 0012 §5 からの差分 (明示的な仕様変更)

| 入力              | ADR 0012 §5 | 本 ADR          |
| ----------------- | ----------- | --------------- |
| `main`            | 拒否        | 受理            |
| `v1.0.0`          | 拒否        | 受理            |
| `refs/heads/main` | 拒否        | 受理            |
| `HEAD^^`          | 拒否        | 受理            |
| `HEAD~3`          | 受理        | 受理 (変更なし) |

ADR 0012 §5 の当時の判断はそのまま残し、コンテキストに本 ADR へのリンクを追記する。

### 2. CLI 側二層防御: `--end-of-options`

入力バリデーション (一層目) が破れても git がフラグとして解釈しないよう、`cli-client.ts` の range 変換関数 `toGuardedRangeArgs` の戻り値先頭に必ず `--end-of-options` を含める。呼び出し側は `toGuardedRangeArgs` を展開するだけで `--end-of-options` を意識しない。これにより将来 diff 系コマンドを追加したときに `--end-of-options` を付け忘れる経路が構造的に塞がれる。

```
git diff -M <toGuardedRangeArgs> -- <path>
git diff --raw -z -M <toGuardedRangeArgs>
git diff --numstat -z -M <toGuardedRangeArgs>
```

`toGuardedRangeArgs(range)` の戻り値:

- `working-vs-head` → `['--end-of-options', 'HEAD']`
- `working-vs-rev` → `['--end-of-options', from]`
- `rev-vs-rev` → `['--end-of-options', from, to]`

`--end-of-options` は git 2.24 以降でサポートされている。git-web が想定する開発環境はそれ以降を前提とする。

### 3. InvalidRevisionError.reason の追加

フロント (タスク B) が入力エラーの原因を分岐できるよう、`InvalidRevisionError` に `reason` フィールドを追加する。

```
type InvalidRevisionReason =
  | 'empty'
  | 'too-long'
  | 'forbidden-chars'
  | 'reflog-form'   // HEAD@{N}
  | 'bad-modifier'
  | 'shape'
```

controller 層では従来どおり 400 にマップする。reason はレスポンスに含めるかどうかをタスク B 側で決める (本 ADR の射程外)。

### 4. `GET /api/refs` エンドポイント

ADR 0009 §1 で将来計画とされていた `/api/refs` を実装する。

#### リクエスト

| クエリ  | 型     | 必須 | 既定 | 説明                                             |
| ------- | ------ | ---- | ---- | ------------------------------------------------ |
| `q`     | string | 任意 | `""` | 絞り込み文字列 (部分一致、大小区別なし、literal) |
| `limit` | 整数   | 任意 | 100  | 返却件数上限 (1〜500)                            |

`q` 自体の制約:

- 長さ 0〜255
- 制御文字禁止
- 正規表現は使わない (ReDoS 回避)。`name.toLowerCase().includes(q.toLowerCase())` のみで判定

`limit` 自体の制約:

- 整数、1〜500、範囲外は 400

いずれの違反も `InvalidRefsQueryError` (新設) で 400 にマップする。

#### レスポンス

```
type RefListDto = {
  readonly head: string | null
  readonly branches: readonly string[]
  readonly tags: readonly string[]
  readonly truncated: boolean
}
```

- `head`:
  - `git symbolic-ref --short HEAD` の結果をそのまま返す (例: `main`)
  - detached HEAD の場合は `symbolic-ref` が非 0 終了するため `null` を返す
  - 空リポジトリ (unborn HEAD) の場合は git の仕様により `symbolic-ref --short HEAD` は `main` (あるいは `init.defaultBranch`) を返すので、そのまま文字列を返す (`null` ではない)。実在しない ref を UI が選択したときは diff 取得で失敗する経路に乗る
  - `q` によるフィルタ対象外、常に実体を返す
- `branches` / `tags`:
  - `git for-each-ref --format='%(refname:short)' refs/heads refs/tags` で取得
  - Node 側で `q` によるフィルタを適用
  - フィルタ後、ブランチを先に詰め、残り枠でタグを詰める
  - 合計件数が `limit` を超えたら切り詰め、`truncated: true`
  - 切り詰め順序: タグを先に削る (ブランチ切替を主要ユースケースとみなすため)
- ソート:
  - ブランチ: `git for-each-ref` のデフォルト順 (refname 昇順)
  - タグ: 同上

#### 実装方針

- `execFile` の `maxBuffer` は diff 系と同じ 50 MB
- `git for-each-ref` には `q` を渡さない。glob と literal 部分一致の意味論差を避けるため、取得は常に全件、絞り込みは Node 側で実施する
- 取得コマンドは以下の 3 本:
  - `git for-each-ref --format='%(refname:short)' refs/heads`
  - `git for-each-ref --format='%(refname:short)' refs/tags`
  - `git symbolic-ref --short HEAD` (例外時は null を返し、エラーは握りつぶす)
- 初版はブランチとタグの取得コマンドを分離する。`git for-each-ref refs/heads refs/tags` の 1 本案も検討したが、分離実行なら tag/branch が同名のときに `refname:short` が `refs/tags/...` のような長い形式へ化ける現象を構造的に回避できる。Promise.all で並列実行するため追加コストは小さい

### 5. `RefListDto` の配置

`@git-web/common` パッケージに追加する (ADR 0006 準拠)。タスク B (フロント) が同じ型を import できるようにする。

### 6. ADR 0009 の更新

- §1 のエンドポイント一覧に `/api/refs` が「実装済み (ADR 0018)」と書き加えるリンクを追記
- §2 の許可文字集合リストに本 ADR へのリンクを追記 (過去判断の保存)

### 7. ADR 0012 の更新

- §Revision バリデーション節のコンテキストに本 ADR へのリンクを追記 (過去判断の保存)

## 結果

### メリット

- diff 画面でブランチ・タグを自然に指定できるようになる (タスク B の前提が整う)
- `HEAD^^` や `feature/foo^2` など git CLI で書ける形が UI からも書ける
- `/api/refs` にフィルタを備えることでキャッシュ設計を後回しにしてよい
- 二層防御 (入力検査 + `--end-of-options`) によりリビジョン引数からのフラグ注入経路が閉じる

### デメリット

- ADR 0012 §5 の判断を実質的に反転する仕様変更のため、既存テストの明示的更新が必要
- `refname` 文法はあえて git 公式の `check-ref-format` より絞っている。ユーザが `@` や `!` を含む特殊な ref 名を作っていた場合は弾かれる (ただし git 側では警告対象の文字でもある)
- UI 既定値 `from=HEAD, to=(worktree)` が API 到達時には `DiffRange.working-vs-rev({raw:'HEAD'})` にマッピングされ、既存の `working-vs-head` kind とは異なる。CLI 出力は `git diff HEAD` と同一なので機能差は無いが、既存テストで kind を比較している箇所は影響を受ける可能性がある (タスク B の引き継ぎメモ)

### 関連

- ADR 0006: 共有型の common パッケージ配置
- ADR 0007: git CLI via execFile
- ADR 0009: セキュリティ境界 (§1 エンドポイント一覧 / §2 許可文字集合を本 ADR で更新)
- ADR 0011: API レイヤ構造
- ADR 0012: diff 表示アーキテクチャ (§5 Revision バリデーションを本 ADR で更新)
