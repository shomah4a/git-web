# 0013. dev サーバー構成

## ステータス

承認済み

## 文脈

前回セッション終了時点で `make serve` が `pnpm --filter @git-web/front dev` (vite dev) のみを起動しており、vite proxy が `127.0.0.1:3000` 決め打ちで api サーバーを参照していた。api を別途起動しないと `/api/*` が ECONNREFUSED になり、セッションを跨ぐと何が動くのか分からなくなる (前回 handover Task #21)。

選択肢を検討した:

1. **vite dev + api を programmatic に proxy 経由で起動** (前回 handover の推奨案)
2. **vite dev + api を tsx watch で並走** (HMR + api auto reload)
3. **`bin/git-web` の経路に集約** (api が front/dist を静的配信、dev も本番と同じ経路)

本プロジェクトはまだ初期段階で以下の状況にある:

- front・api どちらも頻繁に触る
- HMR による state 保持ライブリロードより、構成の単純さと「dev と本番の経路一致」を優先したい
- `bin/git-web` が既に api から front/dist を配信する機構を持つ (ADR 0009 のローカル bind 前提済み)

## 決定

### dev 配信は本番と同じ経路を使う

`make serve` は vite dev サーバーを立てず、**`bin/git-web` と同じ経路** で api 1 本に集約する:

- `./bin/pnpm build` で front と api をビルド
- api を起動し、`staticDir` に `packages/front/dist` を渡して /api 以外を静的配信
- アクセスは api の URL 1 つ

### ポート: 47906 固定 (デフォルト)

待ち受けポートは `47906` をデフォルト値としてハードコードで採用する。dev と本番 (`git web`) で共通の経路を使う方針なので、両者同じデフォルトになる。

- 選定根拠: 10000〜65535 の範囲で一度だけ乱数生成した結果
- 利便性 (URL の再現性・ブックマーク可能) と衝突確率の低さのトレードオフ
- `PORT` 環境変数で上書き可能 (衝突時や複数起動時の逃げ道)
- 衝突した場合は起動がエラー終了する。その時点で `PORT` を指定するか再検討する
- bind 先は 127.0.0.1 のみ (ADR 0009 維持)

### `bin/git-web` のデフォルトポート変更

`bin/git-web` は以前 `start()` に port を渡しておらず、api 側のデフォルト (port 0 = ランダム割当) で起動していた。本 ADR で以下に変更する:

- `PORT` 環境変数を読み取る `readPortFromEnv()` を追加
- 未指定なら `DEFAULT_PORT = 47906` を使う
- api の `main.ts` 直接起動経路にある `readPortFromEnv` と命名を揃える

本番で URL が毎回変わらなくなるため、外部からの再訪 / ブックマークが機能するようになる副次効果がある。

### Makefile の `serve`

```make
serve:
	$(PNPM) build
	./bin/git-web
```

`PORT` 指定は不要 (bin/git-web のデフォルトで 47906 になる)。

- 毎回ビルド (差分ビルドに任せる)
- 単一プロセス、Ctrl+C でそのまま終了
- HMR なし、watch なし

### HMR / watch の扱い

本 ADR では採用しない。今後 front の UI 開発で state 保持ライブリロードが必要になった段階で別 ADR で再検討する。候補:

- vite dev を別ターミナルで立てる運用 (現状維持)
- tsx watch + vite dev を統合する仕組み (Task #21 の方向性)

## 影響

- front ソース変更時は手動 `make serve` 再起動が必要 (差分ビルドが効くので数秒)
- api ソース変更時も同様
- dev と本番 (`git web`) の配信経路が一致するため、「dev では動くのに本番で死ぬ」系の食い違いが減る
- vite proxy の考慮が不要になる

## 関連

- ADR 0009: セキュリティ境界 (127.0.0.1 bind 前提を維持)
- ADR 0011: api レイヤリング
- 前回 handover Task #21: 本 ADR で完了扱い
