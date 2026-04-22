# ADR 0048: ブランチ弧配置の重なり修正

## ステータス

承認済み

## コンテキスト

グラフビューで read-more により追加読み込みを行うと、本流と合流済みブランチのノードが本流と同一の X=0 に配置され、重なって表示される不具合がある。

### 原因

`use-graph-simulation.ts` のブランチ弧配置ロジックで、弧の下端 (`bottomRank`) に fork point（ブランチが本流から分岐した点）の BFS ランクを使用している。

BFS は最短経路でランクを割り当てるため、fork point は本流経由で低いランク（例: 1）を持つが、ブランチノードはブランチパスを辿った先にあるため高いランク（例: 18）を持つ。結果として弧の範囲 `[topRank=0, bottomRank=1]` に対し、実際のブランチノードが rank `[1, 18]` に分布する。

`arcX` の計算で `t = (nodeRank - topRank) / span` が 1.0 ���大幅に超え、`sin(π * t)` が 0 に収束するため、ブランチノードが X=0（本流位置）に配置される。

read-more 前は本流ノードが 2 個（rank 0, 1）のみで重なりが目立たないが、read-more 後に本流ノードが rank 2 以降にも追加されるため、ブランチノードと同一の (X, Y) 座標に重なり視覚的に顕在化する。

## 決定

ブランチパス走査中にノードの最大 rank を追跡し、`bottomRank` を `Math.max(forkPointRank, maxBranchPathRank)` に変更する。

これにより弧の範囲がブランチパスの全 rank 範囲をカバーし、`arcX` が正しく非ゼロの X 座標を返す。

### 変更対象

- `packages/front/src/graph/use-graph-simulation.ts`: `bottomRank` 決定ロジックの修正

### 変更しないもの

- `arcX` 関数のインターフェースと内部ロジック
- `build-graph.ts`（データ構築層）
- `SimNode` 型定義

## 影響

- ブランチノードの表示位置が変わる（正しい弧上に配置される）
- `bottomRank` が大きくなる方向の変更のため、`span <= 0` の新たなエッジケースは発生しない
