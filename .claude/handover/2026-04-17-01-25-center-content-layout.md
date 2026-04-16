# コンテンツのセンタリング

## セッション概要

- コンテンツ領域を `max-width: 1280px` で中央寄せにした
- ブランチ: `feat/center-content-layout`
- ADR 0042 として設計決定を記録

### レイアウト方針

| 領域 | 幅 |
|------|-----|
| ヘッダー（タイトル・テーマ切替・タブ） | 全幅 |
| page-header-slot（パンくず・ブランチ選択） | 1280px センタリング |
| diff ルートのコンテンツ | 全幅 |
| その他のルートのコンテンツ | 1280px センタリング |

### 変更内容

1. App.vue に `.content-area` クラスを新設し、`router-view` と `#page-header-slot` に diff 以外で適用
2. 各コンポーネントの `max-width: 900px` を削除し、幅制限を App.vue に一元化
3. `blob-view--chromeless` クラスを削除（max-width 解除用途が不要になったため）
4. `use-document-title.ts` の既存 lint エラー（`as` 型アサーション）を修正
5. ADR 0039 に ADR 0042 への変更リンクを追記

## TODO

- main へのマージ
