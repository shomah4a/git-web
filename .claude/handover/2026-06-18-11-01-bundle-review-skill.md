# 申し送り: git-web-reviews スキルのブラッシュアップとリポジトリ同梱

## セッション概要

git-web の diff view で付けたレビューコメントを Claude Code に読ませる運用で、outdated 判定が
無く live/済みの区別がつかない課題に対応した。

- git-web-reviews スキルに outdated 判定 + 行翻訳を追加。未解決コメントを
  **live (現在行へ翻訳) / outdated (アンカー行が削除) / 追従不可 (target に path 無し)** に
  分類して返すようにした。
- 行翻訳は本体 `packages/front/src/diff/translate-line.ts` の translateNewLine/translateRange、
  resolved 畳み込みは `packages/api/src/domain/review.ts` の foldResolved (append 出現順の
  後勝ち) を **Python に移植** した依存ゼロスクリプト `translate-reviews.py` として実装。
  pure 関数に doctest 同梱。
- これを git-web 利用者向けの配布物として **`claude/skills/git-web-reviews/`**
  (ドット無し・リポジトリ直下) に同梱しコミットした。`.claude/skills/` (ドット有り) は
  「このリポジトリ開発用」の認知になるため不採用。
- ADR 0061 を作成し、ADR 0060 に相互リンク。本体 TS 2 箇所に parity 追従用の相互参照
  コメント (JSDoc) を追記。README にスキル同梱を追記。

### ブランチ / コミット

- ブランチ: `feat/bundle-review-skill` (base: main a09ea71)。**未 push / 未 merge**。
- `dfc4f01` ADR 0061 追加 + 0060 リンク
- `b693f2d` スキル同梱 + 本体相互参照コメント
- `0641975` README 追記
- (本申し送りコミットが続く)

### 検証

- doctest パス。合成リポジトリ e2e で live/outdated/追従不可/resolved 非表示を確認。
- prettier --check 全 pass。`./bin/pnpm -r test` 全 pass (common 30 / api 782 / front 298)。
- defensive-planner / implementation-safety-checker 評価実施。CRITICAL/HIGH なし。
  評価全文は main 側 `.claude/tmp/2026-06-18_bundle-review-skill_*.md` に保存。

## TODO / 残課題

- **ブランチの push / main への merge** は未実施 (この環境では push 不可。利用者操作)。
- safety-checker の MEDIUM 2 件はユーザー判断で**現状維持 (修正しない)**:
  - git 呼び出し失敗時にトレースで異常終了する (無効 rev / リポジトリ外実行)。
  - コメント行のフィールド検証が本体より緩い (必須キー欠落で KeyError)。
  両者とも読み取り専用・本体が書く正常データ前提では顕在化しないため許容。
- **parity の二重保守** (TS 本体 ⇄ translate-reviews.py): 自動検知なし。本体
  translate-line.ts / review.ts foldResolved を変更したらスクリプトも追従すること
  (相互参照コメントと ADR 0061 §4 に記載)。将来 CI 導入時はクロス言語 golden 化を検討。
- スキル実体のグローバル/プロジェクト二重化の整理はユーザー領分 (本タスク範囲外)。
