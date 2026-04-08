# 0014. diff 全ファイル一括表示と foldable

## ステータス

承認済み

## 文脈

ADR 0012 で定めた diff 表示は「ファイル一覧 + 選択時に 1 ファイルだけ遅延ロード」という UX だった。運用してみて、以下の要望が出た:

- 全ファイルの diff をスクロール 1 枚で読みたい (GitHub PR の "Files changed" タブ相当)
- ファイル一覧はナビゲーションとして残したい
- 個々のファイル単位で折りたたみたい (デフォルトは展開)

サーバー側の API は現状維持で、フロントエンド側の振る舞いを変更する方針。

## 決定

### データ取得

- 既存の `/api/diff/files` と `/api/diff/file?path=...` をそのまま使う
- フロント側で `fetchDiffFiles()` 後、返ってきた各ファイルに対して `fetchDiffFile(path)` を `Promise.allSettled` で並列実行する
- 1 ファイルの fetch が失敗しても他ファイルの表示は継続する (per-file error card)

N+1 リクエストになるが、初期段階のリポジトリでは実害が小さいと判断する。規模が増えて問題化した時点で別 ADR で bulk endpoint (`/api/diff/files?include=content`) を検討する。

### UI 構成

- 左: ファイル一覧 (変更なし。ナビゲーションとして使う)
- 右: 全ファイルの diff を縦に並べて描画
- ファイル一覧クリックで該当ファイルセクションへ `scrollIntoView({ behavior: 'smooth' })`
- 各ファイルセクションには `id="diff-file-${encodeURIComponent(path)}"` を付与する

### ファイル単位の foldable

- 各ファイルセクションはヘッダークリックで折りたたみ可能
- デフォルトは展開 (collapsed = false)
- 折りたたみ状態はコンポーネント内の reactive ref で保持 (永続化しない)

### エラー・状態表示

ファイル単位の state を以下のタグ付き union で持つ:

```
loading   — fetch 進行中
success   — DiffFileDto を保持
notFound  — サーバーが 404 を返した (対象 path が存在しない)
error     — 取得エラー (メッセージ付き)
```

UI はファイルカードごとにこれを振り分けて表示する。

### race condition

ADR 0012 で許容していた「ユーザーが高速にファイル切替した場合の race」は、本 ADR で「マウント時に一括 fetch」する方式に変わることで消滅する (以降ユーザー操作による追加 fetch は発生しない)。

### スコープ外 (別タスク)

以下は本 ADR では扱わない:

- **Split View (左右分割)**: ADR 0015 で別タスクとして扱う (インライン表示のまま)
- **Shiki 構文ハイライト**: 未定
- **スクロール連動のファイル一覧ハイライト**: 未定
- **word-diff**: 未定

## 影響

- `packages/front/src/components/DiffView.vue` を改修
  - 状態管理を「選択中ファイル」から「全ファイル state のリスト」に変更
  - ファイル一覧クリックのハンドラを select → scroll に変更
  - ファイルセクションヘッダーに折りたたみトグルを追加
- `packages/front/src/components/DiffView.test.ts` を改修
  - 「クリックで fetch」前提のテストを「マウント時に一括 fetch」前提に置き換える
  - 折りたたみトグルのテストを追加
- `App.vue` / `App.test.ts` への影響なし (DiffView の外部仕様は「マウントされたら何か描画する」ままで変わらない。ただし `/api/diff/file` を叩くようになるので mock が追加で呼ばれる)

## 関連

- ADR 0012: diff 表示アーキテクチャ (本 ADR の前提)
- ADR 0015 (予定): Split View レイアウト
