# 0052. SVG 等のテキストベース画像を `<img>` 経由で表示する

## ステータス

承認済み

## 文脈

ADR 0028 で「画像ファイル (.png, .jpg, .jpeg, .gif, .svg, .webp) は `<img>` タグで表示する」と決定していたが、実装上 `resolveBlobContent` の画像判定が `if (blob.binary)` 分岐の内側に置かれていた。

`blob.binary` は API 側で「stdout に NUL バイトを含むか」で判定している。SVG は XML テキストであり NUL バイトを含まないため `binary: false` となり、画像表示の経路 (`kind: 'image'`) に入らずソース表示の経路に流れて XML が生で表示されていた。

加えて、現在の対応拡張子 (`.png .jpg .jpeg .gif .svg .webp .ico .bmp`) には主要モダンブラウザで `<img>` タグ表示可能なフォーマットが一部欠落している。

## 決定

### 1. 画像判定を `binary` フラグから独立させる

`packages/front/src/components/blob-content-state.ts` の `resolveBlobContent` で、画像判定 `isImagePath(path)` を最上位の if として `blob.binary` チェックより前に置く。

```ts
if (isImagePath(path)) {
  return { kind: 'image', rawUrl: buildImageRawUrl(path, rev) }
}
if (blob.binary) {
  return { kind: 'binary', path: blob.path }
}
// 以下、テキスト処理
```

これにより SVG (binary:false) もバイナリ画像 (binary:true) も同じ image 経路を通る。

### 2. 表示経路は `<img src>` のみ

SVG を含むすべての画像は既存の `BlobContent.vue` の `<img :src="state.rawUrl" :alt="fileName" />` 経路で表示する。

採用しない選択肢:

- `v-html` で SVG XML を直接 DOM に埋め込む: 内部の `<script>` や `onload` 等のイベントハンドラ、外部 fetch が同一オリジン権限で実行されてしまう
- `<object data="..." type="image/svg+xml">` / `<iframe src="...">` での読み込み: 同上 + 子文書からの DOM/Cookie アクセスが発生しうる
- SVG をフェッチして `innerHTML` に流し込む: 同上

採用理由:

- HTML 仕様および主要ブラウザ実装上、`<img>` で読み込まれた SVG はスタティックイメージとしてサンドボックスされ、内部スクリプト・外部リソース参照・イベントハンドラは実行されない (Same-Origin であっても同様)
- 既存の `/api/blob/raw` エンドポイントは `image/svg+xml` を含む正しい Content-Type を既に返している

### 3. 対応画像拡張子の追加

主要モダンブラウザ (Chrome / Firefox / Safari / Edge) すべてが `<img>` で表示可能な以下を追加する:

| 拡張子  | Content-Type | 備考                                        |
| ------- | ------------ | ------------------------------------------- |
| `.avif` | `image/avif` | AVIF。WebP の後継として採用が広がる         |
| `.apng` | `image/apng` | アニメーション PNG                          |
| `.jfif` | `image/jpeg` | JPEG の歴史的拡張子。実体は JPEG として扱う |

フロント `IMAGE_EXTENSIONS` (blob-content-state.ts) と API `EXTENSION_MAP` (content-type.ts) の両方に追加する。両者は対応関係が崩れるとデグレードを生むため、変更は常に同期する。

> 補遺 (2026-05-15): この同期はその後 [ADR 0053](0053-common-pure-constants-and-functions.md) によって common パッケージへの一元化で担保された。
> 拡張子追加は `packages/common/src/image-extension.ts` のみ更新すればフロント / API 双方に反映される。

### 4. スコープ外とする画像形式

以下は一部ブラウザのみ対応であり「今どきのブラウザで表示できる」要件を満たさないため見送る:

- **JPEG XL** (`.jxl`): Safari 17+ のみ。Chrome は実装を撤回
- **HEIC / HEIF** (`.heic`, `.heif`): 実質 Safari のみ
- **TIFF** (`.tif`, `.tiff`): 実質 Safari のみ
- **JPEG 2000** (`.jp2`): 実質 Safari のみ

将来クロスブラウザ対応が進んだ時点で追加 ADR で対応する。

### 5. 誤拡張子 / LFS ポインタの扱い

- `.svg` という名前の非 SVG テキスト (誤拡張子) は `<img>` に渡され、ブラウザが描画失敗して alt が表示される。現行の "XML 生表示" よりは依頼意図に近いため許容する
- Git LFS ポインタが `.svg` 等の名前で来た場合は壊れた画像表示となるが、本リポジトリは LFS 利用を前提としていないためスコープ外

## 結果

### メリット

- SVG / AVIF / APNG / JFIF が想定どおり画像としてプレビュー表示される
- 画像判定が `binary` フラグから独立し、真理値表が読みやすくなる
- フロントが `blob.content` を経由しない経路となるため、巨大画像のメモリ使用量が改善

### デメリット

- 誤拡張子のテキストが `<img>` に渡されると壊れた画像表示になる (前項のとおり許容範囲)

### 関連

- ADR 0028: ファイルビュー・README 表示・Markdown/Mermaid レンダリング (本 ADR で画像判定の実装方針を補正)
