# diff view コンテキスト展開機能

## セッション概要

- ブランチ: `feature/diff-context-expand`
- GitHub の diff view にある「展開」ボタンと同等の機能を実装した
- hunk 間のギャップ部分に展開ボタンを表示し、クリックで前後 10 行のコンテキストを tokenMap から取得して表示する
- API の追加は不要。フロントエンドのみの変更

### 変更内容

1. ADR 0050 を作成
2. `packages/front/src/diff/expand-context.ts`: ギャップ計算・展開行算出の純粋関数群（新規）
3. `packages/front/src/diff/expand-context.test.ts`: ユニットテスト（新規）
4. `packages/front/src/components/DiffView.vue`:
   - `expandState` (Map<string, Map<number, GapExpansion>>) で展開状態を管理
   - hunk の v-for 内にギャップ展開ブロック・ボタンを挿入
   - ギャップが完全展開されたら後続 hunk ヘッダーを非表示にして視覚的に結合
   - revision 切り替え時に expandState をリセット
   - tokenMap にデータがないファイルでは展開ボタン非表示

### テスト結果

- `./bin/pnpm check`: green (API 605件、front 236件、common 7件)

### 評価結果

- 防衛的計画評価: 確度 0.90、主要指摘は GapInfo.total の old/new 分離（対応済み）
  - 全文: `.claude/tmp/2026-04-27_diff-expand-defensive-plan-review.md`
- 実装安全性評価: HIGH/CRITICAL なし、MEDIUM 3件（ADR 記述修正は対応済み、残り2件は対応不要と判断）、LOW 2件
  - 全文: `.claude/tmp/2026-04-27_diff-expand-safety-review.md`

## TODO

- main へのマージ
- 目視確認（dev サーバーでの動作確認）
  - 先頭/末尾/hunk 間のギャップで展開が機能すること
  - 展開済み行にシンタックスハイライトが適用されること
  - ギャップが埋まったら展開ボタンが消えること
  - ギャップが埋まったら後続 hunk ヘッダーが非表示になること
  - revision 切り替えで展開 state がリセットされること
- MEDIUM 指摘の対応判断（ユーザー確認待ち）
  - テンプレート内 `getGaps()` の重複呼び出し（パフォーマンス）
  - 展開行の左右スクロール同期未設定
- 既存 TODO（申し送り 2026-04-22-11-20）の継続:
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
