# ADR 0029: ファイル名ベースの言語判定（Makefile 対応）

## ステータス

承認

## コンテキスト

ADR 0012 で導入した `inferLanguage` 関数は拡張子ベースの単純マッピングのみで
言語を判定していた。そのため、拡張子を持たないファイル（`Makefile`,
`GNUmakefile` 等）はシンタックスハイライトが適用されなかった。

また、`.mk` 拡張子のファイルも `EXTENSION_TO_LANGUAGE` に登録されておらず、
同様にハイライトされなかった。

Shiki は `makefile` を bundledLanguages としてサポートしている。

## 決定

### 1. ファイル名ベースのマッピング追加

- `FILENAME_TO_LANGUAGE` マッピングを新設し、拡張子を持たないファイルを
  ファイル名（小文字正規化済み）で判定できるようにする
- 初期エントリ: `makefile`, `gnumakefile` → `'makefile'`

### 2. 拡張子マッピング追加

- `EXTENSION_TO_LANGUAGE` に `mk: 'makefile'` を追加する

### 3. フォールバック順序

`inferLanguage` の判定順序を以下とする:

1. 拡張子あり → `EXTENSION_TO_LANGUAGE` で判定
2. 拡張子なし（または隠しファイル） → `FILENAME_TO_LANGUAGE` で判定
3. いずれにも該当しない → `null`

## 影響

- `blob-service` と `diff-service` で `inferLanguage` を呼び出している箇所に
  影響するが、戻り値が `null` から `'makefile'` に変わるだけであり、
  ハイライトが適用されるようになる以外の副作用はない
- 将来、`Dockerfile` 等の拡張子なしファイルにも `FILENAME_TO_LANGUAGE` を
  拡張するだけで対応可能
