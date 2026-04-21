# コミットグラフビューの追加

## セッション概要

- ブランチ: `feat/commit-graph-view`
- `/graph` ルートにコミット履歴をノードグラフとしてインタラクティブに表示するビューを追加した

### 変更内容

1. ADR 0047 を新規作成 (コミットグラフビューの設計)
2. バックエンド: `CommitEntry` / `CommitDto` に `parentHashes` を追加 (加法的変更、`parentCount` は残存)
3. ログパーサー: 親ハッシュ配列を返すよう変更
4. フロント型ガード: `isCommitDto` に `parentHashes` チェック追加
5. `packages/front/src/graph/build-graph.ts`: DAG 構築純関数 (メインストリーム判定、expand-branch、read-more)
6. `packages/front/src/graph/use-graph-simulation.ts`: 幾何レイアウト (メインストリーム縦一列 + ブランチ sin 弧配置)
7. `packages/front/src/graph/use-graph-viewport.ts`: 自前パン・ズーム制御
8. `packages/front/src/components/GraphView.vue`: SVG 描画コンポーネント
9. ルーティング `/graph` 追加、Graph タブ追加、content-area 幅制約解除

### 試行と棄却した方式

- **d3-force**: ブランチの分岐→マージ間がきれいな形に収束しなかった
- **d3-zoom**: Vue のイベントシステムと競合し Firefox + タッチパッド環境でイベントを受け取れなかった
- **斜め配置**: ビューポート幅の活用は良いが、ブランチとの位置関係が複雑になった

d3 サブパッケージは全て依存から削除済み。

### 機能

- メインストリーム (first-parent 連鎖) を X=0 の縦一列に配置
- マージ枝はデフォルト折りたたみ、expand-branch ノードで展開可能
- ブランチノードはマージコミットと合流点を結ぶ sin 弧上に配置
- マージコミットは二重丸で表示し通常コミットと区別
- ノードサイズは変更行数の対数に比例 (clamp あり)
- ノードクリックで詳細パネル (フルメッセージ、diff/tree リンク)
- 背景ドラッグでパン、ホイールでズーム (ポインタ中心)
- ノードドラッグで再配置、離すと幾何位置に戻る
- read-more ノードで段階的読み込み (追加読み込み時リロケーション)
- テキストはズーム時にサイズ固定 (逆スケール適用)
- 日付フォーマット: YYYY-mm-dd HH:MM +XX:XX
- ライト/ダークテーマ対応

### 評価結果

- 実装安全性評価: CRITICAL/HIGH なし、MEDIUM 2件 (対応済み)、LOW 3件
  - 全文: `.claude/tmp/2026-04-22_commit-graph-view-safety-review.md`

### テスト結果

- `./bin/pnpm check`: green

### 計画文書

- `/home/ubuntu/.claude/plans/generic-nibbling-lamport.md`

## TODO

- ブランチの弧配置の改善 (現状は sin カーブだが、見栄えの調整が必要)
- main へのマージ
- 未使用パラメータ `viewportSize` の整理
- `edgePath` の O(N) 検索を Map 化 (大規模リポジトリ対応)
- `formatDate` の共通化 (CommitsView.vue との重複)
