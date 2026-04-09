# 0016. `/api/blob` エンドポイントの追加 (構文ハイライト前提の全文取得)

## ステータス

承認済み

## 文脈

ADR 0012 で diff 表示アーキテクチャを決めた時点から、構文ハイライトは「後付けできる構造」として `DiffFileDto.language` フィールドを確保していた。実装の段になり、ハイライト対象を「diff の hunk 内容のみ」とすると、文脈依存の構文 (複数行文字列、複数行コメント、markdown fenced code block、テンプレート文字列等) が hunk 境界で崩れる問題が顕在化した。

本格的な diff viewer (GitHub / GitLab / VS Code) は例外なく「両サイドのファイル全体をハイライトしてから diff 行にマッピング」する戦略を採っている。推測根拠:

- GitHub: TreeSitter ベースのハイライト。参考: <https://github.blog/2023-08-21-how-we-improved-syntax-highlighting-at-github-with-tree-sitter/>
- GitLab: Rouge でファイル全体をハイライトしてから diff に流し込む (推測 / 確度 0.7)
- VS Code: Monaco editor が両サイドのファイル全体をメモリに保持しているので原理的に全文ハイライトになる (事実)

git-web でもこの戦略 (以下「全文ハイライト方式」) を採用する。Shiki 導入自体は別 ADR (0017 予定) に分離し、本 ADR では **全文ハイライトに必要なサーバサイドの blob 取得エンドポイント追加** のみを扱う。

### 分割の根拠

- エンドポイント追加 (api / common) と Shiki 組み込み (front) は独立にレビュー・コミットできる
- 先にエンドポイントを固めておけば、Shiki 導入タスクは front 内で閉じる
- 各 ADR が対応する層を明確にできる

## 決定

### エンドポイント

```
GET /api/blob?path=<path>&rev=<rev>
  → BlobDto
  or 404 (ファイル未存在)
```

- `path`: 対象ファイルパス。既存 `parseDiffPath` のバリデーションを流用する (ただし下記「`parseDiffPath` の segment ベース修正」を同時に実施)
- `rev`: リビジョン。既存 `parseRevision` を流用する。**省略時は worktree を指す**。`/api/diff/files?from=&to=` の「省略時 = worktree」規約と一貫させる
- `rev=` (空文字) は 400。クエリ上で `rev` キー自体を与えないケースだけを worktree として扱う。理由: 空文字の `parseRevision` はそもそも失敗するので、挙動を明示的に「空文字は不正リビジョン」に倒す
- 原則 `GET` のみ、ADR 0009 §1〜§3 準拠

### クエリセマンティクス

| rev           | 意味                                    | サーバ実装                       |
| ------------- | --------------------------------------- | -------------------------------- |
| キーなし      | worktree のファイル                     | `fs.readFile(repoRoot/path)`     |
| `HEAD` 等 rev | 指定 rev のそのパスに対応する blob 内容 | `git cat-file blob <rev>:<path>` |
| 空文字 `rev=` | 400                                     | `InvalidRevisionError`           |

### BlobDto (packages/common/src/blob.ts 新設)

```ts
export type BlobDto = {
  readonly path: string
  readonly rev: string | null // worktree (キー無し) は null
  readonly content: string // binary 時は空文字
  readonly binary: boolean
  readonly language: string | null // 既存 inferLanguage を流用
}
```

サイズ上限 / truncated は**初版では入れない**。理由: 本アプリはローカル動作前提であり、サーバ側で切り詰める積極的理由がない。ハイライト時の CPU コスト問題は front 側 (ADR 0017) でガードする。

将来、binary の base64 返却が必要になった場合は `BlobDto` に `encoding?: 'utf-8' | 'base64'` を後方互換に追加する余地がある。初版では導入しない。

### ドメインモデル (api 内部)

```ts
// domain/blob.ts
export type Blob = {
  readonly path: string
  readonly rev: Revision | null
  readonly content: string
  readonly binary: boolean
  readonly language: string | null
}
```

### port と adapter

`domain/ports/blob-reader.ts` に `BlobReader` port を定義:

```ts
export type BlobReader = {
  /**
   * 指定パス・リビジョンのファイル内容を取得する。
   * rev が null の場合は worktree のファイルを返す。
   * ファイルが存在しない場合は null を返す。
   */
  read(path: string, rev: Revision | null): Promise<Blob | null>
}
```

実装アダプタ:

- `adapter/git/cat-file-blob-reader.ts`: `rev !== null` のケース。`git cat-file blob <rev>:<path>` を `execFile` で呼ぶ
- `adapter/fs/worktree-blob-reader.ts`: `rev === null` のケース。`fs.readFile` する
- `adapter/blob-reader-composite.ts`: 上記 2 つを `rev` の有無で dispatch

`adapter/fs/` は新設。同系統で ADR 0011 に適合する。

### `git cat-file blob` を使う理由 (`git show` ではなく)

- `git show HEAD:<dir>` は tree listing を 200 で stdout に出してしまい、非ゼロ終了しない。ディレクトリ指定を 200 で受けてしまう事故を防ぐため、blob 限定で扱える `cat-file blob` を採用する
- blob 以外 (tree / commit / tag) を指した場合 `cat-file blob` は非ゼロ終了 (`fatal: Not a valid object name` 等) するので、非存在判定と同じ経路で 404 にできる

### `execFile` 呼び出し時の環境変数と maxBuffer

- `env: { ...process.env, LC_ALL: 'C', LANG: 'C' }` を必ず渡す。理由: git のメッセージ揺れ (将来 i18n 化された場合) を防ぎ、stderr の安定マッチを可能にする
- `maxBuffer: 50 * 1024 * 1024` (50MB) を指定する。既存 `DIFF_MAX_BUFFER` と揃える。デフォルト 1MB では通常サイズでも失敗する

### adapter のテスト容易性 (execFileFn の DI)

- `createCatFileBlobReader` は引数に `execFileFn: typeof execFile` を受け取り、テストでは fake を注入する
- production では `import { execFile } from 'node:child_process'` の実体を渡す

### 非存在 / エラー判定

- `try { await execFileFn(...) } catch (err)` で `ExecFileException` を受ける
- `err.code === 128` かつ `stderr` が `fatal: ` で始まる、または stdout が空 / blob 取得失敗系のパターンの場合は `null` を返す (controller で 404)
- その他のエラーは再 throw して既存 error-mapper に任せる

### worktree 側の realpath 境界検査

`fs.readFile(repoRoot/path)` を呼ぶ前に以下を検査する:

1. `parseDiffPath` でパス構造を検証 (下記 segment ベース修正と合わせて `..` segment / 絶対パス / バックスラッシュ / 制御文字 / `//` 等を弾く)
2. `path.resolve(repoRoot, targetPath)` で絶対パス化
3. `fs.realpath(repoRoot)` と `fs.realpath(resolved)` をそれぞれ取得
4. 純粋関数 `isInsideRepo(rootReal, targetReal)` で境界を判定する
   - 判定式: `targetReal === rootReal || targetReal.startsWith(rootReal + path.sep)`
   - 関数として切り出し、単体テストで `rootReal` 完全一致 / `rootReal/sub` / `rootReal` 直下ファイル / 末尾 sep / repo 外 symlink 等を網羅する
5. 違反時は `InvalidDiffPathError` を throw

**TOCTOU** (`realpath` と `readFile` の間にパスが差し替えられる): 本 ADR では許容する。前提は「repo root 内は信頼されたファイル」。ADR 0009 の脅威モデルでは攻撃者が repo 内ファイルを任意タイミングで差し替えられる前提は取っていない。

### `parseDiffPath` の segment ベース修正 (本 ADR スコープ)

既存 `parseDiffPath` は `input.includes('..')` で `..` を部分一致拒否している。これは `Dockerfile.node..alpine` や `config..old.yaml` のような正規ファイル名を誤拒否する。

diff 経路では git が返した path をそのまま渡すので実害が出ていなかったが、blob エンドポイントは**クライアントが任意 path を指定する入口**であり、この誤拒否がユーザ体験に直接影響する。

対策: `parseDiffPath` の `..` チェックを segment ベースに変更する。

```ts
// 変更前
if (input.includes('..')) {
  throw new InvalidDiffPathError(input, 'contains ..')
}

// 変更後
if (input.split('/').some((seg) => seg === '..')) {
  throw new InvalidDiffPathError(input, 'contains parent segment')
}
```

- パストラバーサル防止の本質は「`..` segment が path component として存在するかどうか」であり、segment ベースが本来の正しい実装
- 既存 diff 経路への影響: git が返す path は `..` を含まないので挙動は変わらない
- 既存 `diff-path.test.ts` で「`..` を部分一致で拒否」を検証しているケースがあれば、segment ベースの意図に沿って書き直す
- 追加テスト: `foo..bar`, `..foo`, `foo..`, `a..b/c` が許可されること / `..`, `../foo`, `foo/../bar`, `a/../b` が拒否されること

### バイナリ検出

- `cat-file blob` / `readFile` のどちらも Buffer で受ける
- NUL バイト (`\0`) を含むなら binary と判定
- `BlobDto.binary = true`, `content = ''` で返す (JSON に UTF-8 化できないバイト列を載せない)
- UTF-16 / UTF-32 テキストは誤判定で binary 扱いになるが、初版では割り切る

### `FsLike` のスコープ

worktree adapter のテスト容易性のために使う `FsLike` は **adapter 内の private 型** にとどめる。port として `domain/ports/` に公開するのは `BlobReader` のみ。`FsLike` はあくまで 1 つの adapter の内部事情。

### `GET /api/blob` の service / controller

- `service/blob-service.ts`: `BlobReader` port を受け取り、Blob ドメインを返す。`inferLanguage(path)` をここで呼び language を埋める
- `controller/blob-controller.ts`: `path` / `rev` クエリを parse し、`BlobReader` → `Blob` → `BlobDto` のシリアライズを行う (`as` 禁止、object literal 変換)
- `path` が欠落 / 空なら 400
- `rev` が **キーとして存在しなければ** `null` を渡す。`rev=` (空文字) は `parseRevision` に渡して失敗させ 400 に倒す
- null → 404 レスポンス
- 例外は既存 error-mapper に任せる
- `http/server.ts` の route 表に `GET /api/blob` を追加
- `main.ts` で DI 配線: `createCatFileBlobReader` / `createWorktreeBlobReader` / `createCompositeBlobReader` を組み立て、controller に渡す

### エラーマッピング

既存 `error-mapper.ts` を拡張:

- `InvalidRevisionError → 400` (既存)
- `InvalidDiffPathError → 400` (既存)
- blob 未存在はコントローラ内で 404 を直接返すため、新エラー型は追加しない

### path バリデーションの再利用

`parseDiffPath` は segment ベース修正後、そのまま blob エンドポイントでも流用する。リネーム (`parsePath` 等) は scope creep になるため本タスクでは行わない。ADR コメントに「diff / blob 共通の path バリデータとして使う」旨を関数 docstring に追記する。

### common の DTO

`packages/common/src/blob.ts` を新設し `BlobDto` を export。`packages/common/src/index.ts` から再エクスポート。

### front 側への影響

本 ADR では front は変更しない。ADR 0017 (Shiki) で `/api/blob` を呼ぶ front 側実装を行う。

## 結果

### メリット

- diff の文脈依存構文 (複数行文字列 / コメント / markdown 等) を正しくハイライトする下地ができる
- エンドポイントが小さく責務が明確 (path + rev) で、将来ファイル閲覧機能 (別タスク) にも転用できる
- api / front のタスク分割ができ、各 ADR が 1 つの関心に対応する
- `parseDiffPath` の segment ベース修正により、合法ファイル名の誤拒否という潜在バグも同時に解消される
- `git cat-file blob` の採用により、`git show` のディレクトリ指定事故を設計時点で回避できる

### デメリット

- リクエスト数が増える (diff ファイルあたり old + new の 2 リクエスト)
- ADR 0016 (Shiki) と想定していたものを 0016 (エンドポイント) + 0017 (Shiki) に分割するため、ADR 番号が 1 個増える
- worktree 経路の realpath ベース境界検査を追加実装する必要がある
- `inferLanguage` を service から呼ぶ参照点が diff-service / blob-service の 2 箇所に増える。ADR 0017 で `inferLanguage` を presentation 寄りに移設する場合、両 service の修正が必要

### 関連

- ADR 0009: セキュリティ境界 (path / rev バリデーションと realpath 検査)
- ADR 0010: 型安全ポリシー (DTO 変換で `as` 禁止)
- ADR 0011: api のレイヤ構造 (port / adapter / service / controller)
- ADR 0012: diff 表示アーキテクチャ (本 ADR はその拡張)
- ADR 0017 (予定): Shiki による diff 構文ハイライト (本 ADR のエンドポイントを利用)
