# ADR 0027: diff/ファイル一覧の GitHub 風サイズ調整

## ステータス

承認

## コンテキスト

diff 表示やファイル一覧のフォントファミリ・フォントサイズ・行間が GitHub の
デザインシステム (Primer) と乖離しており、見た目の統一感に欠ける。

現状の主な値:

- フォントファミリ: `ui-monospace, monospace` (各コンポーネントに直書き)
- diff 本文フォントサイズ: `0.9em` (~14.4px)
- diff 行間: `1.4`
- 行番号幅: `3em`

## 決定

### フォントファミリの CSS 変数化

`theme.css` に `--font-mono` を追加し、全コンポーネントで参照する。

```css
--font-mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
```

### サイズ値の GitHub 準拠

px 直指定ではなく rem / unitless 値を使い、アクセシビリティ (ブラウザの
フォントサイズ設定) を維持しつつ GitHub 相当の見た目を実現する。

| プロパティ              | 変更前    | 変更後    | 根拠                               |
| ----------------------- | --------- | --------- | ---------------------------------- |
| diff 本文 font-size     | `0.9em`   | `0.75rem` | 16px \* 0.75 = 12px (GitHub 準拠)  |
| diff 行間 (line-height) | `1.4`     | `1.667`   | 12px \* 1.667 ≈ 20px (GitHub 準拠) |
| .row min-height         | `1.4em`   | `1.667em` | line-height と整合                 |
| 行番号幅                | `3em`     | `4em`     | 4桁行番号の余裕確保                |
| 行番号 padding          | `0 0.5em` | `0 10px`  | GitHub 準拠                        |

### 変更対象コンポーネント

font-family の統一は以下全てに適用する:

- `DiffView.vue`
- `RevisionTreeView.vue`
- `WorktreeView.vue`
- `RevisionCombobox.vue`
- `App.vue`

font-size / line-height の調整は DiffView.vue を主対象とし、他コンポーネントは
font-family 統一のみとする (サイズ感は既に適切なため)。

### 変更しないもの

- TypeScript ロジック
- テンプレート構造
- カラートークン (既に ADR 0021 で調整済み)

## 影響

- CSS のみの変更でロジックへの影響なし
- rem / unitless 値の採用によりブラウザのフォントサイズ設定を尊重
- フォントファミリの CSS 変数化により将来の変更が容易
