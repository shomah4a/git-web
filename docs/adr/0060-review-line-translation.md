# 0060. レビューコメントの行翻訳と表示突合

## ステータス

承認 (一部未実装)

## 実装状況 (2026-06-17 時点)

- **実装済み**: Tier1 の行翻訳純粋関数 `packages/front/src/diff/translate-line.ts`
  (`translateNewLine` / `translateRange`、ユニットテスト済み)。
- **未結線 (E2)**: 表示中 diff が現在の `to` コミットに紐づくコメントのみを取得・表示する
  実装になっており、`from..to` に含まれる他コミット由来コメントの取得と
  `translate-line` による翻訳適用は **未結線**。
- **未実装 (E3)**: 翻訳後行が hunk 外のときの自動コンテキスト展開。
- 現状の挙動: `to` を具体コミットに合わせてレビューする運用 (GitHub で head コミットに
  コメントする形) では正確に動作する。`to` を別コミットへ進めると、以前のコミットに
  付けたコメントは追従表示されない (既知の制約)。E2 結線時は `DiffView` の
  `commentThreadsForHunk` を翻訳後行番号ベースへ変更する必要がある。

## 文脈

ADR 0057 のコメントはコミット SHA + path + new 側行範囲でアンカーされる。diff view は任意の
`from..to` を表示するため、コメントを付けた時点の SHA (commentSHA) と現在表示中の `to` が
異なる場合に、コメントを現在の diff のどの行に出すかという突合が必要になる。

GitHub は head が進むたびにコメント位置を再計算し、対応付け不能なら outdated に退避する。
本 ADR では、その挙動の核心 (Tier1 + Tier2) を front 側で実装し、リネーム跨ぎ (Tier3) は
対象外とする方針を定める。

## 決定

### 1. 突合は front 側で行う

- 表示中の `from..to` に含まれる各コミット SHA の review を `GET /api/reviews` で取得する
- 各コメント (commentSHA, newLineRange) を現在の `to` の行へ翻訳する
- 翻訳に必要な `commentSHA..to` の diff は、**既存の `GET /api/diff/file` を
  `range={from: commentSHA, to}` で再利用** して取得する (翻訳専用 API は新設しない)

front 側翻訳でも、git 引数の安全性は server 側の既存バリデーション (`parseRevision` 等) で
担保される。行翻訳ロジック自体は server に同等処理が存在しない新規ロジックであり、二重化
ではない (ADR 0011 のレイヤリングに違反しない)。

### 2. Tier1: 行番号翻訳と outdated

- `commentSHA..to` の diff hunk を走査し、commentSHA 側の new 行番号を `to` 側の new 行番号へ
  翻訳する純粋関数を `packages/front/src/diff/` に置く (`expand-context.ts` / `pair-lines.ts`
  と同じ書き味・同じ場所)
- commentSHA == to のときは翻訳不要 (直結)
- 対象行が `commentSHA..to` で **削除されていれば outdated** と判定し、インライン表示せず
  outdated として扱う

### 3. Tier2: hunk 外コメントの自動展開

- diff view は変更 hunk + 手動展開分しか描画しない。翻訳後の行が現在の hunk に含まれない
  無変更領域に来た場合、その行を含むコンテキストを **自動展開** してコメントを表示する
  (既存 `expand-context.ts` の展開ロジックを再利用)
- 自動展開分は **手動展開 (`expandState`) と分離した別 state** で管理する。手動展開状態を
  プログラム的に上書き・競合させない

### 4. Tier3 (リネーム跨ぎ) は対象外

commentSHA と `to` でパスが変わったケース (rename) の追従は本 ADR では扱わない。リネーム
されたファイルのコメントは追従しない既知の制約とする。

### 5. 既存 DiffView との非干渉 (回帰防止)

- コメント突合の fetch は `runDiffLoad` の **generation カウンタに組み込む**。rev 切替時に
  古い SHA のコメントが残る race を防ぐ (後発優先, ADR 0017 と整合)
- コメント / 自動展開で DOM が変化するため、scroll-sync の再 setup がそれらのタイミングでも
  走るよう watch トリガを整合させる (または コメント DOM を `.hunk-content` の外側に配置して
  querySelector 構造を不変に保つ)
- 行アンカーは new 側行番号 (`newLineNo`) ベースで持ち、DOM 行 (rowIdx) との対応はビュー内で
  解決する

### 6. 表示精度の段階性 (既知の中間状態)

実装はフェーズ C4 (突合なし) → D2 (作成 UI) → E (突合) の順で進む。C4〜D 時点では翻訳が
入らないため、commentSHA == to のときのみ行が正確に一致し、それ以外はずれうる。E 完了で
追従が成立する。

## 非採用案

- **API 側で翻訳**: git 実行がサーバに閉じる利点はあるが、review API が diff port に依存し
  結合が増える。front は既に hunk を扱う基盤 (expand-context) を持つため front 側に寄せる。
- **厳密マッピング以上 (Tier3 リネーム追従)**: コストが大きく核心体験には不要。後回し。

## 結果

- コメントを付けた後に `to` を進めても、コメントが追従表示 / outdated 退避される
- 翻訳純粋関数を切り出すことで、mock なしで翻訳ロジックを単体テストできる
- リネーム跨ぎは追従しない (既知の制約)

## 関連 ADR

- ADR 0057: 機能スコープ
- ADR 0017: diff の generation race 管理 (突合 fetch をここに組み込む)
- ADR 0050: コンテキスト展開 (Tier2 が再利用)
- ADR 0011: API レイヤリング
