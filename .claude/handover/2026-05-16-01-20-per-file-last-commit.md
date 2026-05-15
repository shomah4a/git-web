# ファイル単位の最終コミット日・メッセージ表示

## セッション概要

- ブランチ: `feat/per-file-last-commit` (worktree: `.worktrees/per-file-last-commit`)
- ツリービュー / worktree ビューに「ファイル単位の最終コミット日 (YYYY-MM-DD) と最終コミットメッセージ」列を追加
- 相対時刻表示は採用せず、ブラウザのローカル TZ で `YYYY-MM-DD` を表示
- worktree 時の未コミット変更は既存 Status 列で表現できているため、本機能は「最終コミット情報の表示」に集中

### 実装内容

#### 新規エンドポイント `/api/tree-commits`

- `GET /api/tree-commits?rev=<rev>&path=<dir>` を新設
- ディレクトリ直下の各エントリ名に対し、最終コミット (hash / date(epoch) / subject) を返す
- worktree モード (rev=null) は内部的に HEAD を解決して使用
- 空リポなど HEAD 未解決時は全エントリ `lastCommit: null` で正常応答

#### git コマンド設計

```
git -c core.quotePath=true log
  --no-merges
  --format=%x00%H%x01%ct%x01%s%x01
  --name-only --no-renames
  --max-count=1000
  --end-of-options <rev>
  -- <dir>/
```

- 当初は `-m --first-parent` (GitHub 挙動) を採用したが、実運用で `Merge branch 'X'` の subject ばかり並んで情報量が薄くなったため `--no-merges` に切り替え
- 内容コミットの author date / subject が表示されるようになり、PR マージ日とはズレるが「ファイルが実体変更された日」を見る用途に適合
- ADR 0054 §2.1 にトレードオフと案 B 採用の経緯を明記

#### レイヤ追加 (ADR 0011 準拠)

- `packages/common/src/tree-commits.ts`: `LastCommitDto` / `TreeCommitDto` / `TreeCommitsResponseDto`
- `packages/api/src/domain/ports/git-tree-commits-client.ts`: `GitTreeCommitsClient`
- `packages/api/src/adapter/git/tree-commits-parser.ts`: NUL/SOH 二段分解パーサ
- `packages/api/src/adapter/git/cli-client.ts`: `lastCommitsByName` 実装 (CliGitClient に `GitTreeCommitsClient` 追加 implements)
- `packages/api/src/service/tree-commits-service.ts`: tree 取得 + targetNames 集計 + path 末尾スラッシュ正規化 (`normalizeDir`)
- `packages/api/src/controller/tree-commits-controller.ts`: クエリパース + DTO 変換
- `packages/api/src/controller/query-params.ts`: rev/path クエリパースを tree-controller と共通化
- `packages/api/src/main.ts`: ルート配線
- `packages/front/src/api/tree-commits.ts`: API クライアント (型ガード付き)
- `packages/front/src/format/date.ts`: `createYmdFormatter(timeZone)` / `detectBrowserTimeZone()`
- `packages/front/src/components/RevisionTreeView.vue`: 列追加 + `lastCommitByName` Map + 遅延フェッチ + generation ガード
- `packages/front/src/components/WorktreeView.vue`: 同じパターンを適用

### ADR

- ADR 0054 新規起票: 「ツリービューでのファイル単位最終コミット表示」
- §2.1 に `--no-merges` 採用の経緯と案 A/B/C の比較を記録
- §5 に submodule (gitlink) を本機能の対象外とする旨を明記

### テスト結果

- `./bin/pnpm check` (lint + format:check + build + typecheck + test) 全 green
- common 30 件 / api 638 件 (+ 38 件追加) / front 262 件 (+ 11 件追加)
- 動作確認: dev server を起動し `/api/tree-commits` を本リポに対して叩き、ルート / `packages/` それぞれ妥当な内容コミットが返ることを確認済み

### 評価結果

- 防衛的計画評価: `.claude/tmp/2026-05-15_per-file-last-commit-defensive-plan-review.md`
  - HIGH 2 件 / MEDIUM 6 件 / LOW 4 件、計画段階で全反映
- 実装安全性評価: `.claude/tmp/2026-05-15_per-file-last-commit-safety-review.md`
  - HIGH/CRITICAL なし、リリース可と判断
  - MEDIUM 3 件は本 PR で対応済 (path 正規化を service 層へ / controller の重複共通化 / ADR に submodule 注記)

### 残 LOW 指摘

1. 非 ASCII / 改行入りファイル名は `core.quotePath` クォート差で `—` 表示 (ADR §5 で仕様化済み)
2. Vue テンプレの `lastCommitByName.get(entry.name)!.date` non-null 断言と Map ルックアップ重複
3. `loadTreeCommits` の race condition のフロントテスト不在 (既存方針踏襲)
4. subject 内 SOH 含有時の namesBlock 部分切り捨て (実運用で発生しない)
5. `parseDiffPath` の末尾 `/` 許容 (既存挙動由来でスコープ外)

### コミット (新しい順)

- `4ab4396` 最終コミット集計を --no-merges 方式に切り替える
- `1184537` WorktreeView にも最終コミット列を追加する
- `131f8b3` ADR 0054 に submodule を本機能の対象外とする注記を追加する
- `db7b44b` controller のクエリパース処理を query-params.ts に共通化する
- `786fd40` tree-commits の末尾スラッシュ正規化を service 層に移す
- `34b9b6a` RevisionTreeView に最終コミット列を追加し遅延フェッチで埋める
- `042a1a0` フロントに tree-commits API クライアントと日付フォーマッタを追加する
- `0246e1b` tree-commits の controller を追加し /api/tree-commits を配線する
- `2225478` tree-commits の service を追加する
- `6da6bdd` CliGitClient に lastCommitsByName を実装する
- `54faa21` tree-commits の domain port とパーサを追加する
- `70aef61` common に tree-commits DTO を追加する
- `fc9d9fa` ADR 0054 を追加しファイル単位の最終コミット表示方針を定める

## TODO

- main へのマージ
- 既存 TODO (申し送り 2026-05-15-22-29 の継続):
  - 任意改善: `<img>` に `loading="lazy"` `decoding="async"` を追加
  - テンプレート内 `getGaps()` の重複呼び出し (パフォーマンス)
  - 展開行の左右スクロール同期未設定
  - `edgePath` の O(N) 検索を Map 化 (大規模リポジトリ対応)
  - ~~`formatDate` の共通化~~ → 部分対応: ツリービュー向けに `createYmdFormatter` を新設。コミット履歴ビューの既存表示ロジックは未差し替え (本 PR スコープ外)
- 本 PR スコープ外の改善候補:
  - 非 ASCII / 改行入りファイル名の C-style クォート解除 (現状 `—` 表示)
  - submodule (gitlink) 表示対応 (別 ADR で検討)
  - サーバ側 `tree-commits` キャッシュ (顕在化したら LRU 検討)
  - フロントの `loadTreeCommits` 用コンポーネントテスト導入時の race condition 検証
