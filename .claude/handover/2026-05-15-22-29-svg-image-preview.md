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

### テスト結果

- `./bin/pnpm check`: green
  - lint / format / build / typecheck / test 全て成功
  - common 7件、API 621件、front 251件 (+12件)

### 評価結果

- 防衛的計画評価: `.claude/tmp/2026-05-15_svg-image-preview-defensive-plan-review.md`
- 実装安全性評価: HIGH/CRITICAL なし、LOW 3件 (詳細は下記)
  - 全文: `.claude/tmp/2026-05-15_svg-image-preview-safety-review.md`

#### LOW 指摘 3件 (本 PR では対応せず TODO 化)

1. フロント `IMAGE_EXTENSIONS` と API `EXTENSION_MAP` がコード上で同期保証されていない (運用ルールは ADR 0052 §3 に明記)
2. ~~`isImageContentType` の利用箇所未確認~~ → 確認済み: 本体コードからの呼び出しはテストのみで影響なし
3. `<img>` に `loading="lazy"` `decoding="async"` ヒントなし (CLS 軽減の任意改善)

## TODO

- main へのマージ
- LOW 1: 次に画像拡張子を追加する際は `@git-web/common` への共通化を検討
- LOW 3: `<img>` に `loading="lazy"` `decoding="async"` を追加する任意改善
- 既存 TODO (申し送り 2026-04-27-18-50 / 2026-05-01-17-35 の継続):
  - テンプレート内 `getGaps()` の重複呼び出し（パフォーマンス）
  - 展開行の左右スクロール同期未設定
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
