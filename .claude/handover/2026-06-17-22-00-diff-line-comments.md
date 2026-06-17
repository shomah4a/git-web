# diff view 行コメント (GitHub 風レビューコメント) 実装

## セッション概要

- ブランチ `feat/diff-line-comments` (worktree: `.claude/worktrees/diff-line-comments`) で実装。
- diff view の行に GitHub 風のコメントを付け、リポジトリ内 `.git-web/reviews/<sha>.jsonl`
  (コメント本体 append-only) + `<sha>.resolved.jsonl` (resolved イベント append-only) に保存。
  外部 agent はコメント本体ファイルを読むだけ。git-web は git 追跡設定 (.gitignore) には関知しない。
- ADR 0057 (機能) / 0058 (永続化) / 0059 (書き込みセキュリティ境界) / 0060 (行翻訳) を起票。
  0009 に補遺で 0059 リンク追記。
- 計画文書: main 側 `.claude/tmp/2026-06-17_diff-line-comments.md`、防衛的評価:
  `..._diff-line-comments-defensive-eval.md`、実装安全性評価: `..._diff-line-comments-safety-eval.md`。

## 実装済み (コミット済み・全テストグリーン: common 30 / api 771 / front 290)

- **A** http: POST body 経路 (GET 非干渉, 413 上限), Origin ガード (POST のみ, 自オリジン以外/欠落 403, 3 表記)。
- **B** domain/review.ts (ReviewSha 40桁ブランド, buildReviewComment, foldResolved/mergeResolved),
  ports/review-store.ts, adapter/fs/jsonl-review-{codec,store}.ts (append-only + 配下チェック + 壊れ行 warn スキップ)。
- **C** common DTO, git-sha-resolver port + cli-client.resolveCommitSha, review-service.listForRevision,
  review-controller GET (`/api/reviews?rev=`), main 配線, front api/reviews.ts (型ガード40桁検証)。
- **D** review-service.addComment/setResolved (now/newId 注入), POST `/api/reviews` (201) /
  `/api/reviews/resolve`, front 投稿フォーム + resolve トグル。
- **C4/D2** front: CommentThread.vue, DiffView.vue に表示・行番号クリック範囲選択・投稿・resolve。
  コメント DOM は `.hunk-content` 外に置き scroll-sync 非干渉。fetch は runDiffLoad の generation 連携。
- **E1** front/diff/translate-line.ts (Tier1 行翻訳純粋関数, テスト済)。

## TODO (残作業)

優先度高 (合意済みスコープのうち未完):

- **E2 (未結線)**: 現状は表示中の `to` コミットに紐づくコメントのみ取得・表示する。
  `from..to` の他コミット由来コメントの取得 + translate-line による翻訳適用が未結線。
  → `to` を別コミットへ進めると過去コメントが追従しない (ADR 0060 の実装状況に明記)。
  結線時は `DiffView.commentThreadsForHunk` を翻訳後行番号ベースへ変更する必要あり。
- **E3 (未実装)**: 翻訳後行が hunk 外のときの自動コンテキスト展開 (既存 expand-context 再利用)。

実装安全性評価の MEDIUM/LOW (HIGH/CRITICAL なし。ユーザー判断待ち):

- M1: submitComment/onToggleResolve の `loadReviews(generation)` レース (実害小・破棄方向)。
- M2: `resolveCommitSha` が存在しない commit でもコメントファイル作成可 (loopback 限定で実害小)。
- M3: `setResolved` が対象 comment id の実在を未検証 (UI 経路では発生しない)。
- M4: resolve トグル失敗が UI に出ない (warn のみ)。`commentError` 相当の表示を足すと UX 改善。
- L: `.git-web/reviews/` の git 追跡方針 (ignore するか) は利用者判断。

## 動作確認の要点

- `to` を具体コミット (40桁に解決できる ref/SHA) に設定すると new 側行番号がクリック可能になり、
  範囲選択 → 投稿でき、`.git-web/reviews/<sha>.jsonl` に追記される。
- `to=作業ツリー` では行番号は commentable にならない (作成不可)。
- ブラウザでの手動 E2E は未実施 (この環境では実施できず)。コンポーネントテストで
  worktree gating / 表示 / 投稿 POST を検証済み。
