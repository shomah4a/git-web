# Makefile シンタックスハイライト対応

## セッション概要

### 実装内容

- **ADR 0029** を新設し、ファイル名ベースの言語判定方針を定めた
- `inferLanguage` 関数を拡張し、拡張子のないファイル（`Makefile`, `GNUmakefile`）を
  ファイル名ベースで言語判定できるようにした
- `.mk` 拡張子を `EXTENSION_TO_LANGUAGE` に追加した

### ブランチ

`main` に直接コミット（開発プロセスの手順省略あり、ADR・申し送りは追加コミットで補完）

### 変更ファイル

- `packages/api/src/domain/language.ts` — `FILENAME_TO_LANGUAGE` 新設、`mk` 拡張子追加、フォールバック判定追加
- `packages/api/src/domain/language.test.ts` — Makefile, GNUmakefile, build.mk 等のテストケース追加
- `docs/adr/0029-filename-based-language-detection.md` — ADR 新設

### 実装安全性評価結果

- HIGH/CRITICAL: なし
- LOW-1: `BSDmakefile` 未対応 → ユーザー判断で対応不要

## TODO

- なし
