# ADR 0047: コミットグラフビュー

## ステータス

承認

## コンテキスト

ADR 0046 で追加したコミット履歴ビュー (`/commits`) はテーブル形式であり、コミットの一覧性に優れる。一方で、ブランチの分岐・マージ構造を視覚的に把握するには不向きである。

git のコミット履歴は DAG (有向非巡回グラフ) であり、ノードグラフとして可視化することでブランチ構造を直感的に理解できる。

## 決定

### ルーティング

- フロント: `/graph` ルートを新設する
- API: 既存の `GET /api/commits` を拡張する (新規エンドポイントは作らない)
- App.vue のタブナビゲーションに Graph タブを追加する
- グラフビューは横幅を広く使うため、`content-area` (max-width: 1280px) を解除する

### API 変更

`CommitDto` に `parentHashes: ReadonlyArray<string>` を追加する。各コミットの親ハッシュ配列をフロントに返すことで、グラフの辺を描画できるようにする。

既存の `parentCount` はそのまま残す。`/commits` ビューは `parentCount` のみ参照しており、加法的変更のため後方互換性を保てる。

### 描画方式

SVG を採用する。

- DOM ベースのためクリック・ホバー等のイベント処理が自然に書ける
- Vue のテンプレート内で直接記述でき、コンポーネントとの統合が容易
- CSS 変数を SVG 要素から参照でき、ライト/ダークテーマ対応が既存の仕組みで可能
- read more ノードによる段階的読み込みで画面上のノード数を制限するため、SVG のパフォーマンスで十分

Canvas は大量ノード (数千以上) で有利だが、ヒットテストの自前実装が必要になり複雑さが増す。

### レイアウトエンジン

d3-force (力学シミュレーション) を採用する。d3 全体ではなく、以下のサブパッケージのみ依存に追加する。

- `d3-force`: ノード配置の力学シミュレーション
- `d3-selection`: DOM 要素選択 (d3-zoom/d3-drag の前提)
- `d3-zoom`: パン・ズーム制御
- `d3-drag`: ノードドラッグ

力の構成:
- `forceY`: トポロジカル順序でY座標を割り当てる (日時ではなくランクを使用。日時だとコミット間隔が不均一になる)
- `forceX`: メインストリームノードを中心軸 (X=0) に強い力で引き寄せる。ブランチノードは弱い力で横にずらす
- `forceLink`: 親子エッジのリンク力
- `forceCollide`: ノードの重なり防止
- `forceManyBody`: 弱い反発力

### メインストリームと枝の表示

- `parentHashes[0]` (first-parent) を辿る連鎖をメインストリーム (幹) として中央に配置する
- マージコミット (parentCount >= 2) の第2親以降の枝はデフォルトで折りたたむ
- マージコミットに「expand branch」バッジを付与し、クリックで枝を展開できる
- 展開時に必要なコミットデータが未取得の場合は API で追加取得する

### ページネーション

既存の `GET /api/commits` のカーソルベースページネーションを再利用する。

- 初期表示は 20 件 (既存の DEFAULT_LIMIT)
- `hasMore === true` のとき DAG 末端に「read more」疑似ノードを配置する
- クリックで `after=<lastHash>` として追加取得し、DAG に追加挿入する

### ノードサイズ

ノードの半径を変更行数の対数に比例させる。大きな変更が視覚的に目立ち、コミットの規模感を直感的に把握できる。

- 基本式: `clamp(MIN_R, BASE_R * log2(totalLines + 1), MAX_R)`
  - `totalLines = insertions + deletions`
- 最小半径 (MIN_R): 変更量ゼロ (空コミット、マージコミット) でも最低限の大きさを確保
- 最大半径 (MAX_R): 巨大なコミットで他のノードを圧迫しないよう制限
- `forceCollide` の半径もノードサイズに連動させる

### インタラクション

- 背景ドラッグ: キャンバス全体のパン
- ノードドラッグ: 個別ノードの再配置 (力学シミュレーションから一時的に外す)
- ホイールスクロール: ズームイン・アウト
- ノードクリック: 詳細展開 (フルメッセージ、diff/tree リンク)

### コンポーネント構成

```
packages/front/src/graph/
  build-graph.ts          # CommitDto[] -> DAG ノード・エッジ構造 (純関数)
  build-graph.test.ts     # テスト
  use-graph-simulation.ts # d3-force シミュレーション composable
  use-graph-viewport.ts   # d3-zoom パン/ズーム composable

packages/front/src/components/
  GraphView.vue           # グラフビューコンポーネント
```

グラフ機能専用の composable は `graph/` ディレクトリにまとめる。グラフ固有のロジックであり、`composables/` に置くより凝集度が高い。

### d3 と Vue の DOM 管理

d3-zoom と d3-drag は DOM を直接操作するため、Vue のリアクティブ DOM 管理と競合しうる。以下の方針で回避する。

- d3 が管理する SVG 要素は Vue の `ref` で参照を渡す
- d3-zoom の transform 状態は composable 内で管理し、Vue テンプレートからは直接バインドしない
- `onMounted` でアタッチ、`onBeforeUnmount` で simulation.stop() とイベントリスナー解除

## 結果

- コミット履歴を DAG として視覚的に表示でき、ブランチ構造の理解が容易になる
- 既存の `/commits` テーブルビューと `/graph` グラフビューを目的に応じて使い分けられる
- 既存 API の加法的変更のみで実現でき、後方互換性を保てる
