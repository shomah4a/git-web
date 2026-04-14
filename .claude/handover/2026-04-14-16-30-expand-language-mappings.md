# Shiki 対応言語の拡張子マッピング一括追加

## セッション概要

### 実施内容

Shiki 4.0.2 がバンドルしている 332 言語のうち、明確なファイル拡張子を持つ未マッピング言語を `EXTENSION_TO_LANGUAGE` / `FILENAME_TO_LANGUAGE` に一括追加した。

### 変更箇所

- `packages/api/src/domain/language.ts`: EXTENSION_TO_LANGUAGE に約 90 エントリ、FILENAME_TO_LANGUAGE に 2 エントリ（dockerfile, justfile）追加
- `packages/api/src/domain/language.test.ts`: 追加マッピングの全件テスト追加
- `docs/adr/0035-expand-language-mappings.md`: ADR 新規作成

### 設計判断

- 検出ロジック（inferLanguage 関数）は変更なし。Record のプロパティアクセスで O(1)
- 曖昧な拡張子はスキップ: `.m`(ObjC/MATLAB)、`.v`(V/Verilog/Coq)、`.pp`(Pascal/Puppet)、`.pro`(Prolog/Qt)
- `.h` は C/C++ 両方で使われるが、TextMate grammar の互換性から `c` にマッピング
- `.properties` は Shiki 上 `ini` grammar の完全エイリアス（セクションヘッダ含む）であり、`.properties` の構文と合致しないため除外

### コミット

- `b34cd80` Shiki 対応言語の拡張子マッピングを一括追加する (ADR 0035)

## TODO

- なし
