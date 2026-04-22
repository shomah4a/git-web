# ブランチ弧配置の重なり修正

## セッション概要

- ブランチ: `fix/graph-branch-arc-overlap`
- グラフビューで read-more 後にブランチノードが本流と重なって表示されるバグを修正した

### 原因

`use-graph-simulation.ts` のブランチ弧配置で `bottomRank` に fork point の BFS ランクを使用していた。BFS は最短経路でランクを割り当てるため、fork point が本流経由で低ランクを持ち、弧の範囲がブランチノードのランク範囲より狭くなっていた。結果として `sin(nπ) ≈ 0` でブランチノードが X=0（本流位置）に配置されていた。

### 修正内容

1. ADR 0048 を作成
2. `use-graph-simulation.ts`: ブランチパス走査中に最大 rank を追跡し、`bottomRank = Math.max(forkPointRank, maxBranchPathRank)` に変更
3. `use-graph-simulation.test.ts`: テスト 3 件を新規作成

### テスト結果

- `./bin/pnpm check`: green (API 606件、front 209件)

### 評価結果

- 実装安全性評価: CRITICAL/HIGH なし、LOW 2件（既存コードの問題、対応不要）
  - 全文: `.claude/tmp/2026-04-22_branch-arc-overlap-safety-review.md`

## TODO

- main へのマージ
- 目視確認（dev サーバーでの動作確認）
- 既存 TODO（申し送り 2026-04-22-03-38）の継続:
  - `edgePath` の O(N) 検索を Map 化（大規模リポジトリ対応）
  - `formatDate` の共通化
