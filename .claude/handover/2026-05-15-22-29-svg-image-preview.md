# SVG など画像拡張子を `<img>` 表示に整流する

## セッション概要

- ブランチ: `fix/svg-preview-as-image` (worktree: `.worktrees/fix-svg-preview`)
- リビジョンビューで SVG が XML テキストとしてそのまま表示される不具合を修正
- 併せて主要モダンブラウザが扱える AVIF/APNG/JFIF を追加対応

### 原因

`packages/front/src/components/blob-content-state.ts` の `resolveBlobContent` で、画像判定 `isImagePath(path)` が `if (blob.binary)` 分岐の内側に閉じ込められていた。SVG は NUL バイトを含まないテキストのため API 側で `binary: false` と判定され、画像経路 (`kind: 'image'`) に入らず source 経路に流れていた。

ADR 0028 では既に「画像は `<img>` で表示」と決定済みで、これは仕様変更ではなく実装漏れの整流。

### 変更内容

1. ADR 0052 作成 (拡張子ベース画像判定 + 対応拡張子拡張)
2. ADR 0028 のコンテキストに ADR 0052 への参照リンク追記
3. `packages/front/src/components/blob-content-state.ts`
   - `isImagePath(path)` を最上位の if に移動 (`blob.binary` 分岐から独立)
   - `IMAGE_EXTENSIONS` に `.avif`, `.apng`, `.jfif` を追加
4. `packages/api/src/domain/content-type.ts`
   - `EXTENSION_MAP` に `.avif → image/avif`, `.apng → image/apng`, `.jfif → image/jpeg` を追加
5. `packages/front/src/components/blob-content-state.test.ts` 新規 (11 ケース)
6. `packages/api/src/domain/content-type.test.ts` に追加 3 拡張子のテスト

### スコープ外と判断した形式

主要ブラウザのうち Safari 専用となる以下は ADR 0052 §4 で見送り:

- JPEG XL (`.jxl`)
- HEIC / HEIF (`.heic`, `.heif`)
- TIFF (`.tif`, `.tiff`)
- JPEG 2000 (`.jp2`)

### コミット

- `e38e553` ADR 0052 を追加し画像表示の判定方針を補正する
- `a7c6f95` SVG など画像拡張子を <img> 表示に整流する
- `7c20b96` 申し送りドキュメントを追加する
- `4fed9a5` ADR 0053 を追加し common に純粋共有定数・関数を許容する
- `893f149` 画像拡張子マップを common に集約する

### 追加対応 (LOW 1 への対処)

ユーザー承認のうえ、フロント / API で重複していた画像拡張子マップを `packages/common/src/image-extension.ts` に一元化:

- `IMAGE_EXTENSION_TO_MIME: ReadonlyMap<string, string>` を single source of truth として配置
- `isImageExtension(path)` / `inferImageContentType(path)` を export
- フロント `blob-content-state.ts` は `isImageExtension` を、API `content-type.ts` は `inferImageContentType` を呼ぶ形に書き換え
- 未使用だった `isImageContentType` (本体コードからの呼び出し皆無、テストのみ参照) は削除

これに伴い ADR 0006 / 0011 の「common は DTO のみ / 実行時コード禁止」制約を ADR 0053 で緩和。緩和条件は「副作用ゼロ・外部ライブラリ依存ゼロ・両側で意味同一・ビジネスドメイン非依存」。ドメインモデルを common に置かない方針は維持。

### テスト結果

- `./bin/pnpm check`: green
  - lint / format / build / typecheck / test 全て成功
  - 最終: common 30件 (+23 image-extension)、API 609件、front 251件

### 評価結果

- 防衛的計画評価: `.claude/tmp/2026-05-15_svg-image-preview-defensive-plan-review.md`
- 実装安全性評価 (初回): HIGH/CRITICAL なし
  - 全文: `.claude/tmp/2026-05-15_svg-image-preview-safety-review.md`
- 実装安全性評価 (common 集約後): HIGH/CRITICAL なし
  - 全文: `.claude/tmp/2026-05-15_common-consolidation-safety-review.md`

#### 残 LOW 指摘

1. ~~フロント / API の拡張子マップ未同期~~ → ADR 0053 + common 集約で解消済
2. ~~`isImageContentType` の利用箇所未確認~~ → 本体未使用と確認の上で削除済
3. `<img>` に `loading="lazy"` `decoding="async"` ヒントなし (CLS 軽減の任意改善、本 PR スコープ外)
4. `IMAGE_EXTENSION_TO_MIME` を Map のまま export している点 (リフレクション破壊が理論上可能、実害なし)
5. ADR 0006 / 0011 本文は据え置きで補遺リンクのみ (dev-process.md の規約通り、対応不要)

## TODO

- main へのマージ
- 任意改善: `<img>` に `loading="lazy"` `decoding="async"` を追加
- 既存 TODO (申し送り 2026-04-27-18-50 / 2026-05-01-17-35 の継続):
  - テンプレート内 `getGaps()` の重複呼び出し（パフォーマンス）
  - 展開行の左右スクロール同期未設定
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
