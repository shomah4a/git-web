# blob 表示にクロームレスモードを追加する

## セッション概要

- blob 表示画面で `chromeless=1` クエリパラメータを付与することでヘッダー・ナビゲーションを非表示にし、コンテンツのみを表示する印刷用モードを追加した
- `useChromeless` composable を新設し、BlobView / WorktreeBlobView で共有
- App.vue のヘッダーを `v-show` で制御（`v-if` ではなく Teleport ターゲットを維持するため）
- chromeless 適用はルート名 `blob` / `worktree-blob` に限定
- chromeless 時は Markdown の Rendered/Source タブを非表示にし Rendered 固定
- トグルボタンはプリンタアイコン / バツアイコンで切り替え、`@media print` で非表示
- watch 対象を `route.query` 全体から rev/path のみに限定し、chromeless トグル時の不要な再 fetch を防止
- ADR 0039 を作成
- ブランチ: `feature/chromeless-blob-view`、コミット: `9d7045b`, `807e0f6`

## TODO

- main へのマージ
