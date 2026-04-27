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
   - 各 hunk の上端に ↑、下端に ↓ ボタンを配置（hunk に紐づいた直感的な配置）
   - ボタンは常に展開済み行の外側（展開の先端）に位置する
   - ギャップが完全展開されたら後続 hunk ヘッダーを非表示��して視覚的に結合
   - revision 切り替え時に expandState をリセッ���
   - tokenMap にデータがないファイ��では���開ボタン非表示

### UI フィードバックによる修正履歴

- 展開ボタンをギャップ中央の横並びから各 hunk の上端/下端に移動（どの hunk を広げるか明確化）
- ボタンを展開済み行の外側に配置（展開後もボタンが先端に移動する自然な操作感）
- up のみで全展開した場合に行が消えるバグを修正（down/up 各方向の範囲分割を修正）

### テスト結果

- `./bin/pnpm check`: green (API 605件、front 238件、common 7���)

### 評価結果

- 防衛的計画評価: 確度 0.90、主要指摘は GapInfo.total の old/new 分離（対応済み）
  - 全文: `.claude/tmp/2026-04-27_diff-expand-defensive-plan-review.md`
- 実装安全性評価: HIGH/CRITICAL なし、MEDIUM 3件（ADR 記述修正は対応済み、残り2件は対���不要と判断）、LOW 2件
  - 全文: `.claude/tmp/2026-04-27_diff-expand-safety-review.md`

## TODO

- main へのマージ
- MEDIUM 指摘の対応判断:
  - テンプレ���ト内 `getGaps()` の重複���び出し（パ��ォーマンス）
  - 展開行の左右スクロール同期未設定
- 既存 TODO（申し送り 2026-04-22-11-20）の継続:
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
