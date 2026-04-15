# Markdown レンダリングビューにアウトライン表示を追加する

## セッション概要

- Markdown レンダリングビューの右側にアウトライン（見出し目次）を表示する機能を追加した
- DOM ベースの見出し抽出方式を採用し、render.ts の変更なしで実現
  - v-html でレンダリングされた DOM から h1-h6 を動的に取得
  - レンダラに依存しないため、将来別のレンダラが追加されても自動対応可能
- `useOutline` composable を新設し、BlobContent.vue で使用
- 見出しにはスラッグ化した id を動的に付与し、クリックでスクロール
- 重複する見出しテキストには連番サフィックスを付与
- 空テキストの見出しはアウトラインから除外
- chromeless モードおよび `@media print` ではアウトライン非表示
- sticky の top を `--header-height` でオフセットし、ヘッダー下に正しく固定
- 見出しクリック時に URL ハッシュを付与し、ブラウザバックに対応
  - `router.push` に path/query を明示的に渡し、query パラメータの消失を防止
- ADR 0040 を作成
- ブランチ: `feature/markdown-outline`

## TODO

- main へのマージ
- コンテンツ領域の幅縮小（max-width: 900px 内で 200px をアウトラインが占有）について必要に応じてレスポンシブ対応を検討
