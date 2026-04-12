# shebang ベース言語判定対応

## セッション概要

### 実装内容

- **ADR 0030** を新設し、shebang ベースの言語判定方針を定めた
- `inferLanguage` のシグネチャを `(path: string, firstLine?: string): string | null` に拡張
- `SHEBANG_COMMAND_TO_LANGUAGE` マッピングを新設（30+ コマンド名、Shiki bundledLanguages 対応）
- `EXTENSION_TO_LANGUAGE` に 22 拡張子を追加（perl, php, lua, awk, r, groovy, scala, elixir, erlang, crystal, julia, swift, dart, nim, tcl, ocaml, racket, scheme, fennel, nushell, zsh, fish）
- blob-service で非バイナリファイルの先頭行を `inferLanguage` に渡すよう変更
- diff-service に `BlobReader` を DI し、new 側リビジョンのファイル先頭行を読み取って shebang 判定
- main.ts で `blobReader` の生成順序を `diffService` 生成前に移動

### ブランチ

`feature/shebang-language-detection`

### 変更ファイル

- `docs/adr/0030-shebang-language-detection.md` — ADR 新設
- `packages/api/src/domain/language.ts` — shebang 判定ロジック、拡張子マッピング追加
- `packages/api/src/domain/language.test.ts` — テスト追加（83 テストケース）
- `packages/api/src/service/blob-service.ts` — 先頭行を inferLanguage に渡す
- `packages/api/src/service/blob-service.test.ts` — shebang 判定テスト追加
- `packages/api/src/service/diff-service.ts` — BlobReader DI、先頭行取得
- `packages/api/src/service/diff-service.test.ts` — BlobReader mock、shebang テスト追加
- `packages/api/src/main.ts` — blobReader 生成順序変更、createDiffService 第3引数追加

### 実装安全性評価結果

- HIGH/CRITICAL: なし
- LOW-1: 削除ファイルの shebang 判定不能（new 側不在）→ 許容
- LOW-2: Rscript のケースセンシティブ → 正しい動作
- LOW-3: diff-service での追加 I/O コスト → 拡張子スキップ最適化が可能だが未対応

### 設計メモ

- front 側のハイライトは blob API 経由で old/new 各サイド個別に language を取得してハイライトする仕組み
- diff API の `language` フィールドは「ハイライト対象か否か」のフィルタ条件として使用される
- old/new で shebang が異なるケースでも、blob API 側で個別判定されるため正しく動作する

## TODO

- なし
