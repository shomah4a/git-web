# 0012. diff 表示アーキテクチャ

## ステータス

承認済み

## 文脈

git-web の最初の縦串機能として diff 表示を実装する。ADR 0011 の 5 層構造 (domain / service / controller / adapter / http) を前提に、API の切り分け、データ形式、使用ライブラリ、フロントの描画責務を決める必要がある。

ユーザーの要求 (議論済み):

1. **リッチに描画したい**。`diff2html` のような HTML 文字列流し込み方式ではなく、Vue の reactive なコンポーネントで描画する。将来は Shiki 構文ハイライト / word-diff / サイドバイサイド / 行選択 / コメント等の機能を追加したい
2. **API は構造化 JSON で返す** (生 patch ではない)。wire format の境界を明確にし、サーバー側で git 出力形式の差異を吸収する
3. **ファイルリストエンドポイントと個別ファイルエンドポイントを分ける**。GitHub PR のように、大量ファイルの diff でも左ペインに即座にファイル一覧が出て、個別の diff は選択時に lazy load される UX を実現する
4. **from / to を最初からサポート**。任意の 2 点間の diff を取れる
5. **diff パーサに jsdiff (`diff` パッケージ 8.0.4) を採用**。依存ゼロ、アクティブメンテ、組み込み types。候補比較は 2026-04-08 計画書参照
6. **フロントは Shiki を後付けできる構造**。DTO の line に `content` (マーカー除外済み) / file に `language` を持たせる

## 決定

### API エンドポイント

```
GET /api/diff/files?from=<rev>&to=<rev>
  → { files: DiffFileSummaryDto[] }

GET /api/diff/file?path=<path>&from=<rev>&to=<rev>
  → DiffFileDto
```

どちらも `GET` のみ。ADR 0009 §1 の禁則 (汎用 git ランナー禁止) に従い、サブコマンドをクライアントが指定することはない。

### クエリパラメータ (DiffRange セマンティクス)

| from | to   | 意味                            | 実 CLI 引数            |
| ---- | ---- | ------------------------------- | ---------------------- |
| なし | なし | 作業ツリー vs HEAD (デフォルト) | `git diff HEAD`        |
| あり | なし | from vs 作業ツリー              | `git diff <from>`      |
| あり | あり | from vs to (2 点比較)           | `git diff <from> <to>` |
| なし | あり | エラー (400)                    | -                      |

重要: `git diff` (引数なし) は worktree vs **index** セマンティクスであり、未 add の変更のみを出す。ユーザーが期待する「未コミットの全変更」とは異なる。本 ADR では **デフォルトレンジで明示的に `git diff HEAD` を呼ぶ**。
`--cached` / staged 領域の分離表示は別タスク (次世代 ADR) で扱う。

### DiffRange ドメイン型

```ts
// domain/diff-range.ts
export type DiffRange =
  | { readonly kind: 'working-vs-head' } // git diff HEAD
  | { readonly kind: 'working-vs-rev'; readonly from: Revision } // git diff <from>
  | { readonly kind: 'rev-vs-rev'; readonly from: Revision; readonly to: Revision } // git diff <from> <to>
```

`kind` 名に `working` を採用したのは `git diff` の用語 (working tree) との整合性のため。

### Revision バリデーション (ADR 0009 §2 準拠)

`parseRevision(input: string): Revision` を domain 層に置く。
許可する形式 (初版):

| 形式               | 正規表現 / 例      | 備考                                           |
| ------------------ | ------------------ | ---------------------------------------------- |
| 完全または短縮 SHA | `^[0-9a-f]{4,40}$` | 4 文字以上 40 文字以下                         |
| `HEAD`             | 完全一致           |                                                |
| `HEAD~N`           | `^HEAD~\d{1,3}$`   | N は 0〜999。`HEAD~0` は許可するが HEAD と同義 |
| `HEAD^` / `HEAD^N` | `^HEAD\^\d{0,1}$`  | N 省略可                                       |

許可しない形式 (初版ではエラー):

- ブランチ名 / タグ名 (将来追加候補)
- `HEAD@{N}` 形式
- 相対フルパス (`refs/heads/...`)
- 任意のパス / `--` / 制御文字

バリデーション失敗時は `InvalidRevisionError` を throw。

### path バリデーション

`parseDiffPath(input: string): string` を domain 層に置く。
拒否する入力:

- 空文字列
- 絶対パス (`/` で始まる)
- `..` を含む
- NUL バイト (`\0`)
- `\\` (バックスラッシュ、Windows パス事故防止)
- 制御文字 (`\u0000`〜`\u001f`)
- `//` (連続スラッシュ)
- 4096 文字超

エラー時は `InvalidDiffPathError` を throw。
加えて、`git diff -- <path>` の結果が空ならファイルなしとして 404 を返す (情報漏洩対策)。
リクエストされた path はファイルリストの結果に含まれている前提だが、サーバーは state を持たないため整合性検査はしない。

### ドメインモデル (api 内部)

```ts
// domain/diff.ts
export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'

export type DiffFileSummary = {
  readonly path: string
  readonly oldPath: string | null // 初版では常に null (rename は modified に丸める)
  readonly status: DiffFileStatus
  readonly additions: number
  readonly deletions: number
  readonly binary: boolean
}

export type DiffLineKind = 'context' | 'add' | 'delete'

export type DiffLine = {
  readonly kind: DiffLineKind
  readonly content: string
  readonly oldLineNo: number | null
  readonly newLineNo: number | null
}

export type DiffHunk = {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly header: string
  readonly lines: ReadonlyArray<DiffLine>
}

export type DiffFile = DiffFileSummary & {
  readonly hunks: ReadonlyArray<DiffHunk>
  readonly language: string | null
}
```

### rename の扱い (初版スコープ外)

jsdiff と git の出力形式のギャップを避けるため、**初版では rename を `modified` に丸める**:

- ファイルリストの `--raw` 経路で rename を検出しても `status: 'modified'` として返す
- `oldPath` は null 固定
- `DiffFileStatus` の型としては 'renamed' / 'copied' を定義しておくが、初版では出力しない

将来的な改善: controller で `--raw` と個別 diff をペア解決し、`git diff -M -- <oldPath> <newPath>` で両側を渡す方式にする。

### DTO (packages/common/src/diff.ts)

ドメインモデルと同型の DTO を用意する (ADR 0011 の「型定義は別にする」方針)。命名は `*Dto` サフィックス。

- `DiffFileStatusDto`
- `DiffLineKindDto`
- `DiffLineDto`
- `DiffHunkDto`
- `DiffFileSummaryDto`
- `DiffFileDto = DiffFileSummaryDto & { language: string | null; hunks: ... }`
- `DiffFilesResponseDto = { files: DiffFileSummaryDto[] }`

controller の serializer (object literal 変換、`as` 禁止) でドメイン → DTO に変換する。

### jsdiff の採用と `adapter/jsdiff/` 配置

- パッケージ: `diff` (jsdiff)、バージョン固定 `8.0.4`
- `packages/api` の dependencies
- 配置: `packages/api/src/adapter/jsdiff/parser.ts` (ADR 0011 の「adapter/$LIB」ルール)
- `domain/ports/diff-parser.ts` に `DiffParser` interface を定義し、`adapter/jsdiff/parser.ts` が実装する
- サービス層は `DiffParser` port に依存し、jsdiff の存在を知らない

### jsdiff の制約と回避

jsdiff `parsePatch` は unified diff に特化しているため、以下の git 拡張情報は parsePatch から直接取れない可能性がある:

- `diff --git` ヘッダの a/path b/path
- `rename from` / `rename to`
- `copy from` / `copy to`
- `Binary files differ`
- `\ No newline at end of file` の扱い

そのため:

- **ファイルリスト** (`diffSummary`): `git diff --raw -z` と `git diff --numstat -z` の結果を自前パースする (jsdiff を使わない)
- **ファイル個別** (`diffFile`): `git diff <range> -- <path>` の unified diff 出力を jsdiff に食わせる
- jsdiff がパースしきれない行 (例: `Binary files differ`) はドメイン変換の前に前処理または後処理する

実装着手前にスパイク調査ステップで parsePatch の挙動を実測し、結果を `.claude/tmp/2026-04-08_jsdiff-spike.md` に記録する。

### git CLI 呼び出し方針 (ADR 0009 §3 準拠)

全て `execFile` で呼び出す。`shell: true` / `exec` は禁止。引数は配列で渡し、`--` 区切りを徹底する。

```
git diff --raw -z [<from>] [<to>]
git diff --numstat -z [<from>] [<to>]
git diff -M [<from>] [<to>] -- <path>
```

rename 検出は `-M` のデフォルト動作のみ。初版では rename 出力は modified に丸めるため、`-M` の閾値はチューニングしない。

### error-mapper の本番経路配線 (L1 残課題対応)

ADR 0011 で土台だけ追加した `controller/error-mapper.ts` を本番経路に繋ぐ:

1. `error-mapper.ts` に `InvalidRevisionError → 400` / `InvalidDiffPathError → 400` を追加
2. `http/server.ts` の `createApiServer` options に `mapError?: (err: unknown) => HttpResponse | null` を追加
3. `main.ts` で `createApiServer({ routes, fallback, mapError: mapDomainErrorToHttpResponse })` と DI
4. ハンドラが例外を throw した場合、http 層は `mapError` を呼び、null でなければそれを返し、null なら従来通り 500 に落とす

### `mapError` の戻り値型の配置 (M3 対応)

`mapError` の戻り値型 `HttpResponse | null` は `http/router.ts` の既存 `HttpResponse` 型をそのまま使う。

controller の `error-mapper.ts` は `http/router.ts` の `HttpResponse` 型を import する。一見 `controller → http` の依存になり ADR 0011 のレイヤ方向と逆向きに見えるが、ADR 0011 の本質は「http が controller を import しない」であり、controller が http 層の **型定義のみ** を import することは依存方向上問題ない (ハンドラの戻り値型として既に同じことをしている)。

別案として `HttpResponse` を共通の上位層 (例: `types/` や `contract/`) に切り出す選択肢もあるが、現時点ではそこまでの抽象化は不要と判断する。

### 言語推定 (language フィールド、`domain/language.ts`)

拡張子から言語名を推定する関数 `inferLanguage(path: string): string | null` を domain に置く。

初版の拡張子マッピング:

```
ts → typescript
tsx → tsx
js → javascript
jsx → jsx
vue → vue
py → python
rs → rust
go → go
java → java
kt → kotlin
rb → ruby
sh → bash
md → markdown
json → json
yaml → yaml
yml → yaml
html → html
css → css
toml → toml
```

上記に該当しない場合は null を返す。

**注記**: 言語識別子 (`typescript` 等) は将来 Shiki の語彙に近い。現時点では domain に置くが、将来 Shiki 統合時に presentation 寄りの層 (例: `adapter/shiki/` または front 側) に移す可能性がある。

### フロントの描画構造

最小の `DiffView.vue` コンポーネントを追加する:

- マウント時に `/api/diff/files` を fetch
- 左ペインにファイルツリー (初版はフラットリスト、パスでソート)
- ファイルクリックで `/api/diff/file?path=...` を fetch
- 右ペインにインライン diff (ハンクごとに行リスト、Shiki 無し)
- エラー表示
- race condition は許容する (後発レスポンスが先発を上書き) — JSDoc で明記

Shiki / word-diff / サイドバイサイドは後続タスク。DTO 構造が拡張を許容する前提で設計されている。

## 結果

### メリット

- API と front の責務境界が明確になる
- 大規模 diff でもファイル一覧が即座に出る UX を実現できる
- Shiki 等の presentation 関心事を後から自然に追加できる
- jsdiff のメンテ性と依存ゼロの恩恵を得られる
- rename / binary 等の git 拡張はサーバー側で吸収される

### デメリット

- ファイルリストとファイル個別で 2 回 git を叩くため、N+1 的なリクエスト増加
- 初版で rename を modified に丸めるため、UX としてはやや劣る (後続で改善)
- domain に language.ts を置くのは presentation 関心事の境界が曖昧

### 関連

- ADR 0009: セキュリティ境界 (§1〜§3 を継承)
- ADR 0010: 型安全ポリシー (DTO 変換で `as` 禁止)
- ADR 0011: api パッケージのレイヤ構造 (本 ADR の前提)
