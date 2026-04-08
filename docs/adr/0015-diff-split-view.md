# 0015. diff Split View レイアウト

## ステータス

承認済み

## 文脈

ADR 0012 / 0014 までは diff をインライン (上から順に context / 削除 / 追加を縦 1 列) で表示していた。GitHub PR の "Split View" のように、削除行を左、追加行を右に並べて視認性を上げたいという要望がある。

変更はフロントエンドの描画責務に閉じる。API / DTO は ADR 0012 のまま維持する。

## 決定

### ペアリングアルゴリズム

jsdiff が生成する line 列を、左右 2 列のテーブル行に変換する純粋関数 `pairLines(lines: DiffLineDto[]): SideBySideRow[]` を新設する。

```
type SideBySideRow = {
  readonly left: DiffLineDto | null
  readonly right: DiffLineDto | null
}
```

アルゴリズム:

1. 入力行を前から走査する
2. `context` → `{ left: line, right: line }` を 1 行出力
3. 連続する `delete` を集める。直後に連続する `add` が続くならそれも集める。`max(deletes.length, adds.length)` 行分のペアを生成し、足りない側は `null` で埋める
4. 直前に `delete` がない単独の `add` → `{ left: null, right: add }`

これにより、直後に add が続く delete は modify 行として同じ行に並び、純削除 / 純追加は対面 `null` の空白行として残る。GitHub PR の Split View と同等の見え方になる。

対面が `null` の空白セルは、描画側で `.row { min-height: 1em 相当 }` を設定することで左右の高さを揃える。これを怠ると空セルが高さ 0 に collapse し左右で行が整列しない。

context / 純 delete / 純 add / delete+add 等量 / delete 過多 / add 過多 / 混在の 7 ケースを単体テストで検証する。

### UI

- `DiffView.vue` のインライン表示を Split View に置き換える
- 各 hunk は CSS grid 4 列 `[old-lineno] [old-content] [new-lineno] [new-content]` で描画
- 左セル: 削除 or context (空なら空セル)
- 右セル: 追加 or context (空なら空セル)
- 色分け: 削除側背景赤、追加側背景緑、context は背景色なし、空セルは薄いグレー
- 行単位の ハイライト (word-diff) は本 ADR では対象外

### 置き場所

- 純粋関数: `packages/front/src/diff/pair-lines.ts`
- 型エクスポート: 同ファイル内
- テスト: `packages/front/src/diff/pair-lines.test.ts`
- Vue 側: `DiffView.vue` 内で hunk レンダリング部を差し替える。本 ADR では別コンポーネントに分割はしない (複雑度が上がる割にメリットが薄い)

## 影響

- `packages/front/src/diff/pair-lines.ts` 新設
- `packages/front/src/diff/pair-lines.test.ts` 新設
- `packages/front/src/components/DiffView.vue` の hunk レンダリング部と CSS を書き換え
- `packages/front/src/components/DiffView.test.ts` のラインカウント前提を更新
- サーバー側 API 無改修

## スコープ外 (別タスク候補)

- word-diff (行内の変更箇所ハイライト)
- インラインビューとの切り替えトグル
- Shiki 構文ハイライト
- コンテキスト行の展開 / 折りたたみ

## 関連

- ADR 0012: diff 表示アーキテクチャ (DTO はこのまま使う)
- ADR 0014: 全ファイル一括表示と foldable (本 ADR の前提)
