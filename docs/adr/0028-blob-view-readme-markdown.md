# ADR 0028: ファイルビュー・README 表示・Markdown/Mermaid レンダリング

## ステータス

承認

## コンテキスト

RevisionTreeView でファイルをクリックしても何も起きない。GitHub のように
ファイル内容を表示するビューが存在しない。また、ディレクトリ表示時に README
を自動表示する機能もない。

> 補足: §1 で画像ファイルを `<img>` タグ表示すると決めたが、実装上
> SVG (テキストベース) が画像として扱われない問題が判明したため、画像
> 判定の方針と対応拡張子を ADR 0052 で補正している。

## 決定

### 1. ファイルビュー (`/blob` ルート)

- `/blob?rev=<rev>&path=<path>` ルートを新設し、BlobView コンポーネントで
  単独ファイルを表示する
- シンタックスハイライトは DiffView と同じ Shiki パイプライン
  (fetchBlob + Highlighter インターフェース) を流用する
- Markdown ファイルの場合は Rendered / Source の切替タブを提供する
- 画像ファイル (.png, .jpg, .jpeg, .gif, .svg, .webp) は `<img>` タグで表示する
  - バイナリ配信用に `GET /api/blob/raw?rev=<rev>&path=<path>` エンドポイントを
    新設し、Content-Type 付きで生バイナリを返す
- その他のバイナリファイルは「バイナリファイルのため表示できません」メッセージ
- 404 は「ファイルが見つかりません」メッセージ + ツリーへの戻りリンク

### 2. RevisionTreeView からの遷移

- ファイル名クリック時に `router.push({ path: '/blob', query: { rev, path } })`
- ディレクトリクリックの既存動作は変更しない

### 3. README 自動表示

- ディレクトリ表示時、ツリー一覧の下に同階層の README を自動表示する
- 検出パターン (case-insensitive、優先順位順):
  1. `README.md`
  2. `README`
  3. `README.txt`
- 複数マッチ時は最も優先度の高いものを 1 つだけ表示する
- README 取得は loadTree 完了後に発火し、generation カウンタで世代管理する

### 4. Markdown レンダリング

- パーサ: `marked` (GFM 拡張対応)
- サニタイズ: `DOMPurify` を通してから `v-html` にバインドする (XSS 対策必須)
- Mermaid: fenced code block の言語が `mermaid` の場合、`mermaid` ライブラリで
  SVG に変換して埋め込む
  - `mermaid` は動的 import で必要時のみロードする (バンドルサイズ対策)
  - パース失敗時はコードブロックとしてフォールバック表示
  - ダークテーマ連動 (Mermaid の theme オプション)
- Markdown 内の相対リンク・画像パスの書き換えは本 ADR のスコープ外とする
  (将来課題)
- HTML (.html, .htm) のレンダリングは XSS リスクが高いためスコープ外
- reStructuredText (.rst) は専用パーサが重いためスコープ外

### 5. スタイリング

- Markdown レンダリング結果に GitHub Primer 風の CSS を適用する
  (見出し、コードブロック、テーブル、リスト、引用等)

### 6. v-html と eslint-disable の例外使用

- Markdown のレンダリング結果を DOM に反映するため `v-html` ディレクティブを使用する
- `vue/no-v-html` ルールの警告を抑制するため、該当箇所に限定して
  `eslint-disable` コメントを付与する
- これはプロジェクトの eslint-disable 禁止ルールに対する例外中の例外であり、
  以下の条件をすべて満たす場合のみ許容される:
  1. 値が `DOMPurify.sanitize()` を通過済みであること
  2. 未サニタイズの文字列が `v-html` に渡される経路が存在しないこと
  3. サニタイズロジックが共通モジュール (`markdown/render.ts`) に集約されていること
- 上記条件を満たさない `v-html` の使用や `eslint-disable` の追加は認めない

## 影響

- 新規ルート `/blob` 追加 (既存ルートへの影響なし)
- 新規コンポーネント BlobView.vue 追加
- RevisionTreeView.vue にクリックハンドラと README 表示を追加
- API に `GET /api/blob/raw` エンドポイント追加
- 依存ライブラリ追加: `marked`, `dompurify`, `mermaid`
