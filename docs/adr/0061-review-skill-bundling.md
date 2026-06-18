# 0061. レビュー収集スキルのリポジトリ同梱

## ステータス

承認

## 文脈

git-web の diff view で付けたレビューコメント (ADR 0057 / 0058) は、外部 agent (Claude Code)
が読んでコードに反映する運用を想定している。この読み取りは `git-web-reviews` という Claude
Code スキルで行う。

当初このスキルは利用者個人の環境 (`~/.claude/skills/` など) にだけ存在し、コメントを付けた
時点の commitSHA 座標系の行番号をそのまま返すだけだった。そのため:

- コメント後にコミットが積まれると、返る行番号が現在の HEAD とずれる。
- 既にコードが書き換わって用済みになったコメント (outdated) と、まだ生きているコメント (live)
  が区別なく並ぶ。

git-web 本体は ADR 0060 でこの突合 (行翻訳 + outdated 判定) を front 側に実装済みだが、スキルは
そのロジックを持っていなかった。スキルをブラッシュアップして本体同等の分類 (live / outdated /
追従不可) を返せるようにしたうえで、これは git-web 利用者が併用すると有用な機能であるため、
**リポジトリに同梱して配布する**ことにした。

## 決定

### 1. 配置場所: `claude/skills/git-web-reviews/` (リポジトリ直下, ドット無し)

- `.claude/skills/` (ドット有り) には置かない。ドット有りは「このリポジトリ自身の開発のための
  スキル」という認知になるため不適切。
- ドット無しの `claude/skills/` に置き、**git-web のプロダクトの一部 (利用者が自分の Claude
  環境へ持っていける配布物)** として同梱する。

### 2. 構成: SKILL.md + 依存ゼロの Python スクリプト

- `SKILL.md`: スキル定義。`context: fork` で隔離サブコンテキスト実行し、同梱スクリプトの
  標準出力 (分類済み一覧) だけを呼び出し元へ返す。
- `translate-reviews.py`: 列挙・resolved 畳み込み・行翻訳・分類を行う本体。Python 標準
  ライブラリのみに依存し、任意のリポジトリで動く。pure 関数には doctest を同梱する。

Python を採るのは、Claude が TypeScript の本体ロジックをそのまま実行できないため。スキルから
本体関数を呼ぶ手段が無く、ロジックを実行可能な形 (スクリプト) で持つ必要がある。

### 3. 本体ロジックの移植と二重保守の明示

`translate-reviews.py` は本体ロジックの移植であり、本体と挙動を一致させる:

- 行翻訳 `translate_new_line` / `translate_range` = `packages/front/src/diff/translate-line.ts`
  の `translateNewLine` / `translateRange` (ADR 0060)。
- resolved 畳み込み `read_resolved` = `packages/api/src/domain/review.ts` の `foldResolved`
  (append 出現順の後勝ち。ts は比較に使わない)。

本体ロジックが TS、スキルが Python という**同一ロジックの言語跨ぎ重複 (二重保守)** が生じる。
これは ADR 0011 (server に git を寄せるレイヤリング) とは別軸のトレードオフであり、Claude が
TS を実行できない制約に起因する意図的な重複である。

### 4. 追従漏れ検知は相互参照コメントで軽減

TS 本体を変更したとき Python 側の追従漏れを自動検知する仕組み (CI / クロス言語テスト) は本 ADR
では導入しない (CI 自体が無く、クロス言語 golden テストはコスト過大)。代わりに、本体側
(`translate-line.ts` / `review.ts foldResolved`) のヘッダコメントに「変更時は
`claude/skills/git-web-reviews/translate-reviews.py` を追従」と相互参照を1行ずつ追記する。

これは強制力の無い軽減策であり、追従漏れによる silent な乖離リスクは残る (既知の制約)。

### 5. スキル独自仕様 (本体に対応が無い部分)

- 対象 SHA 決定: スキルは引数なし時に既定ブランチ (`main` → `master`) との `merge-base..HEAD`
  を対象にする。本体のレンジ決定は API 引数で `from..to` を受ける設計で、ベースブランチ自動
  推定は本体に存在しない概念。スキル固有仕様とする。
- 保存先解決: `--git-common-dir` から root を解決し、worktree からでもメイン worktree の
  `.git-web/reviews/` を参照する (ADR 0058 の「保存先をメイン worktree ルートに集約」と整合)。

### 6. 読み取り専用と安全性

- スキルは `.git-web/reviews/` を**読むだけ**。編集・追記・削除・resolve はしない (resolve は
  人間が UI から行う。ADR 0058 / 0059)。
- 引数は `subprocess` の配列形式で git に渡し shell を経由しない。path は `--` 区切りで分離する。
  SHA はファイル名正規表現でフィルタする。リビジョン引数は本体 server の `parseRevision` 相当の
  明示バリデーションは通らず git の rev 解釈に委ねるが、閲覧専用かつローカル実行のため影響は
  限定的とする。

## 非採用案

- **`.claude/skills/` 配置**: Claude Code のプロジェクト開発用スキルという認知になり、配布物
  としての意図がぼやける。
- **スキル側ロジックをエージェント手計算で実装 (スクリプト無し)**: diff 全文をコンテキストに
  読み込む必要がありトークン増・誤り混入リスク。決定性に劣る。
- **TS/Python の golden テストで parity 自動担保**: クロス言語テスト基盤が無く実装コスト過大。
  相互参照コメントに留める。

## 結果

- git-web 利用者は clone するだけでレビュー収集スキルを併用でき、未解決コメントが
  live / outdated / 追従不可 に分類されて得られる。
- 本体ロジックの TS/Python 二重保守が新規の保守負債として発生する (相互参照コメントで軽減)。

## 関連 ADR

- ADR 0057: 機能スコープ (diff 行コメント)
- ADR 0058: レビュー永続化フォーマット (foldResolved の出典)
- ADR 0059: 書き込みセキュリティ境界
- ADR 0060: レビューコメントの行翻訳と表示突合 (行翻訳ロジックの出典)
- ADR 0011: API レイヤリング
