# ファイル単位 history への導線追加

## セッション概要

- ブランチ: `feat/file-history-links` (worktree: `.worktrees/file-history-links`)
- 目的: ツリービュー (Last commit msg/date 列) と blob ビュー (右上ツールバー) からファイル単位 history (`/commits?path=`) へ遷移する導線を追加する
- ADR: 0056 (新規、承認)

## 実装内容

### 共通ヘルパー

- `packages/front/src/components/history-url.ts`
  - `buildHistoryUrl(rev, path)`: `/commits` への `RouteLocationRaw` を返す。rev が null / 空 / `'HEAD'` のときは省略
  - `resolveHistoryRev(currentWt, worktrees)`: worktree モードでの rev 解決。default worktree は null (HEAD 解決)、linked worktree は worktrees list から headHash を引く。未解決時は null
- `packages/front/src/components/history-url.test.ts`: 12 ケース (Mock 不要、pure 関数テスト)

### フロント

- **RevisionTreeView.vue**: blob 行の Last commit msg/date セルを `<router-link>` 化。`@click.stop` で行クリックの blob 遷移と二重発火させない
- **WorktreeView.vue**: 同上。`resolveHistoryRev` で worktree HEAD ハッシュを解決し `rev=` に渡す。未解決時は `canShowHistoryLink === false` でテキスト表示にフォールバック (race condition 対策)
- **BlobView.vue**: `.blob-toolbar` 内、印刷モードボタンの**左**に `<router-link>` で history アイコンボタンを追加
- **WorktreeBlobView.vue**: 同上。`onMounted` で `/api/worktrees` を fetch。linked worktree 選択中で headHash 未解決のときは `<span class="toolbar-button-disabled">` で disabled 表示にする (silent failure 回避)
- CSS: 既存 `.chromeless-toggle` を `.toolbar-button` クラスに統一 (BlobView / WorktreeBlobView)

### ADR

- ADR 0056 新規起票: 「ファイル単位 history への導線追加」
  - §3 worktree モードでの rev 解決表
  - §4 race condition 対策 (WorktreeView は非リンク化、WorktreeBlobView は disabled)
  - §5 `buildHistoryUrl` 共通ヘルパー
  - Future Work: `/api/commits?wt=` 対応、ディレクトリ集約 history、`--follow` rename 追従

## バックエンド変更

なし。`/api/commits?path=` は既に `parseDiffPath` 検証込みで実装済み (commits-controller.ts:39, 78-84)。

## 評価結果

- 防衛的計画評価: `.claude/tmp/2026-05-16_file-history-links-defensive-plan-review.md`
  - HIGH 3 件 / MEDIUM 4 件 / LOW 3 件
  - HIGH 全件を計画段階で取り込み (race condition の disabled / null チェック / 解決前は非リンク化)
- 実装安全性評価: `.claude/tmp/2026-05-16_file-history-links-safety-review.md`
  - HIGH/CRITICAL なし、リリース可
  - LOW-1 (Unicode エスケープの日本語化) は本 PR で対応済
  - MEDIUM 3 件は YAGNI / 任意対応のため見送り (下記 TODO)

## テスト結果

- `./bin/pnpm check` (lint + format:check + build + typecheck + test) 全 green
- common 30 件 / api 700 件 / front 274 件 (+ 12 件追加)
- **実機ブラウザでの動作確認は未実施**。ヘッダー teleport / router-link の DOM 構造は型・テンプレートチェックで検証済みだが、実際の遷移と CSS 表示は要確認

## コミット (新しい順)

- `c93fda8` prettier 適用
- `04069e8` ツリービューの Unicode エスケープを直接表記に統一する
- `cacf88f` HistoryLinkCell を切り出し msg/date セルの router-link 重複を解消する
- `607e0a2` WorktreeView の worktrees ref を null 始まりに統一する
- `a6b6826` HistoryIcon コンポーネントに SVG を切り出し重複を解消する
- `60115d6` 申し送りドキュメントを追加する
- `a5ea520` history-link の title 属性を Unicode エスケープから日本語表記に直す
- `5ffdc7c` prettier 適用
- `15f9a63` resolveHistoryRev を history-url.ts に切り出し WorktreeView/WorktreeBlobView から使う
- `13c75bd` WorktreeBlobView 右上に history リンクを追加する
- `2e6f942` BlobView 右上に history リンクを追加する
- `5419eff` WorktreeView の blob 行 Last commit 列を /commits リンクにする
- `d10088e` RevisionTreeView の blob 行 Last commit 列を /commits リンクにする
- `ebc1960` ADR 0056 を起票してファイル単位 history への導線方針を定める

## TODO

- main へのマージ
- 実機ブラウザでの動作確認:
  - revision ツリー: blob 行の msg/date セルクリックで `/commits?rev=<rev>&path=<file>` に遷移するか
  - worktree ツリー: default worktree / linked worktree それぞれで rev クエリが期待通りか
  - BlobView: 右上の history アイコンが印刷モードボタンの左に表示され、middle-click で別タブが開くか
  - WorktreeBlobView: linked worktree 選択中で worktrees list 取得前は disabled 表示か
  - @media print で blob-toolbar が非表示になるか

### 安全性評価で挙がった MEDIUM (本 PR ですべて対応済)

1. ~~**msg/date セルの `<router-link>` 重複**~~ → `HistoryLinkCell.vue` に切り出し済 (`cacf88f`)
2. ~~**WorktreeView と WorktreeBlobView で worktrees ref の型が不一致**~~ → 両方とも `... | null` (null 始まり) に統一済 (`607e0a2`)
3. ~~**WorktreeBlobView の history SVG が enabled / disabled で 2 重定義**~~ → `HistoryIcon.vue` に切り出し済 (`a6b6826`)
4. ~~**ツリービューの Unicode エスケープ表記** (`📁` / `📄` / `—`)~~ → 直接表記に統一済 (`04069e8`)。NUL バイトなど制御文字のエスケープは可読性のため残す

### Future Work (ADR 0056)

- `/api/commits` の `wt` クエリ対応。実装後は ADR 0056 §3 の暫定挙動 (`rev=<headHash>`) を `wt=<name>` に置き換える
- ディレクトリ単位の集約 history (`/commits?path=<dir>`) を UI から正式サポート
- `git log --follow` によるファイル rename 追従 (ADR 0046 の既知制約)。本タスクで入り口が増えたことで顕在化しやすくなる

### 既存 TODO (前回申し送りより継承)

- worktree-list-parser が未知ラベルを除外しない (ADR 0055 §6 と若干齟齬)
- WorktreeContextResolver の force-refresh が inflight 共有問題
- rev 指定経路 (cat-file) は isInsideRepo ガード対象外
- App.vue の `activeWorktree=null` 時、ヘッダが repo.head に fallback して WorktreeView の 400 エラーと UI 不整合
- `<img>` に `loading="lazy"` `decoding="async"` を追加
- テンプレート内 `getGaps()` の重複呼び出し
- 展開行の左右スクロール同期未設定
- `edgePath` の O(N) 検索を Map 化
- 非 ASCII / 改行入りファイル名の C-style クォート解除 (現状 `—` 表示)
- submodule (gitlink) 表示対応 (別 ADR)
- サーバ側 `tree-commits` キャッシュ (顕在化したら LRU)
- フロントの `loadTreeCommits` 用コンポーネントテスト導入時の race condition 検証
