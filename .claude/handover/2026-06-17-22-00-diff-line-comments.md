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
- **E2** (実装済): `GET /api/reviews/commits?from=&to=` で範囲内のコメント保持 SHA を列挙し、
  front が各 SHA のコメントを translateRange で現在の to 行へ翻訳。hunk 内はインライン、
  hunk 外/outdated はファイル末尾の退避セクションに表示。
- 安全性評価 MEDIUM 対応済: M1 (再取得のローカル世代), M2 (commit 実在検証),
  M3 (resolve 対象 id 実在検証), M4 (resolve 失敗の UI banner)。

## TODO (残作業)

- **E3 文字どおりの自動展開**: 現状は hunk 外コメントを「退避セクション」に出すのみ。
  該当行のコンテキストを自動展開してインライン表示する挙動は未実装。実装するなら
  expand-context の auto-expand state を手動 expandState と分離して導入し、展開済み行ブロック
  にもコメントスレッドの描画を足す必要がある (DiffView の expanded-rows 描画 3 箇所)。
- **手動 E2E 未実施**: ブラウザ確認はこの環境では不可。コンポーネントテストで
  worktree gating / 表示 / 投稿 / E2 翻訳表示を検証済み。実機での目視確認が望ましい。
- **L**: `.git-web/reviews/` の git 追跡方針 (ignore するか) は利用者判断 (git-web は関知しない)。

## 動作確認ポイント (追加)

- `to` を、過去にコメントを付けたコミットより新しいコミットに設定すると、過去コメントが
  翻訳されて現在行に表示される (hunk 内) か、退避セクションに出る (hunk 外/削除) ことを確認。

## 動作確認の要点

- `to` を具体コミット (40桁に解決できる ref/SHA) に設定すると new 側行番号がクリック可能になり、
  範囲選択 → 投稿でき、`.git-web/reviews/<sha>.jsonl` に追記される。
- `to=作業ツリー` では行番号は commentable にならない (作成不可)。
- ブラウザでの手動 E2E は未実施 (この環境では実施できず)。コンポーネントテストで
  worktree gating / 表示 / 投稿 POST を検証済み。
