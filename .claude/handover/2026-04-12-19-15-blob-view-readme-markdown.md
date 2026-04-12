# ファイルビュー・README 表示・Markdown レンダリング

## セッション概要

### 実装内容

- **ADR 0028** を新設し、ファイルビュー・README 表示・Markdown/Mermaid レンダリングの方針を定めた
- **`/blob` ルート + BlobView コンポーネント新設**: ファイル内容を Shiki シンタックスハイライト付きで表示
  - Markdown は marked + DOMPurify でレンダリング、Rendered/Source 切替タブ
  - Mermaid コードブロックは動的 import で SVG に変換、ダークテーマ連動
  - 画像ファイルは `/api/blob/raw` 経由で `<img>` 表示
  - バイナリファイル・404 のフォールバック表示
  - パンくずリストでツリーへのナビゲーション
- **`/api/blob/raw` エンドポイント新設**: バイナリファイルを Content-Type 付きで配信
  - realpath + isInsideRepo によるリポジトリ境界検査付き
- **RevisionTreeView 改修**:
  - ファイルクリック時に `/blob` に遷移
  - ディレクトリ表示時にツリー下部に README を自動表示 (優先順位: readme.md > readme > readme.txt)
- **Markdown レンダリングロジックを `markdown/render.ts` に共通化**
- **App.vue**: `/blob` ルートで Revision タブをアクティブに
- **Markdown CSS**: GitHub Primer 風スタイル (`styles/markdown.css`)
- **依存追加**: marked 18.0.0, dompurify 3.3.3, mermaid 11.14.0

### ブランチ

`feature/blob-view-readme-markdown` (3 コミット、main 未 merge)

### セキュリティ判断

- v-html + DOMPurify のパターンを採用。eslint-disable は例外的に許可（ADR 0028 に記載）
- DOMPurify の ADD_TAGS に foreignObject, style を許可（Mermaid SVG 用）

### 実装安全性評価結果

- HIGH-1: raw blob reader のシンボリックリンク脆弱性 → 修正済み (realpath + isInsideRepo 追加)
- HIGH-2: eslint-disable 使用 → ユーザー許可済み、ADR に例外記載
- MEDIUM-3: foreignObject/style 許可 → 現時点で対応不要
- MEDIUM-4: レンダリングロジック重複 → 共通化済み
- MEDIUM-5: テスト不足 → content-type, raw-blob-reader, blob-raw-controller のテスト追加済み

## TODO

- [ ] main への merge (ユーザー判断)
- [ ] HTML (.html, .htm) レンダリング対応 (次回スコープ)
- [ ] reStructuredText (.rst) 対応 (次回スコープ)
- [ ] Markdown 内の相対リンク・画像パスの書き換え (将来課題)
