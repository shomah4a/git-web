# ADR 0030: shebang ベースの言語判定

## ステータス

承認

## コンテキスト

ADR 0012 / ADR 0029 で導入した `inferLanguage` 関数は拡張子およびファイル名
ベースのマッピングで言語を判定していた。しかし、拡張子を持たないスクリプト
ファイル（例: `script` という名前で `#!/usr/bin/env python3` を持つ）は
判定できなかった。

shebang（`#!` で始まるファイル先頭行）はスクリプトの実行インタプリタを
示す UNIX の慣例であり、言語判定の有力な手がかりとなる。

## 決定

### 1. `inferLanguage` のシグネチャ拡張

```typescript
inferLanguage(path: string, firstLine?: string): string | null
```

第2引数 `firstLine` はオプショナル。呼び出し側がファイル内容を持っている
場合にのみ先頭行を渡す。副作用（ファイル読み取り等）は関数内部で行わず、
呼び出し側に委ねる（副作用の外部化原則）。

### 2. 判定優先順序

1. 拡張子 → `EXTENSION_TO_LANGUAGE`
2. ファイル名 → `FILENAME_TO_LANGUAGE`
3. 先頭行（渡された場合のみ） → shebang パース → `SHEBANG_COMMAND_TO_LANGUAGE`
4. いずれにも該当しない → `null`

拡張子が存在する場合は shebang を見ない。拡張子の方が信頼性が高く、
shebang と拡張子が矛盾するケースで予測可能な動作を保証するため。

### 3. shebang パース仕様

対応する形式:

- 直接パス: `#!/bin/<cmd>`, `#!/usr/bin/<cmd>`, `#!/usr/local/bin/<cmd>` 等
- env 経由: `#!/usr/bin/env <cmd>`
- env -S 経由: `#!/usr/bin/env -S <cmd>`（`-S` の直後の引数をコマンド名とする）

スコープ外:

- `#!/usr/bin/env -S -u python3` のような複数オプション連鎖
- env の長いオプション形式（`--split-string` 等）

パース手順:

1. `#!` で始まるか判定
2. 空白で分割し、先頭トークンのベース名を取得
3. ベース名が `env` の場合、次のトークンが `-S` なら更にその次、そうでなければ
   次のトークンをコマンド名とする
4. ベース名が `env` でない場合、それ自体をコマンド名とする
5. コマンド名を `SHEBANG_COMMAND_TO_LANGUAGE` で引く

### 4. コマンド名と言語のマッピング

| コマンド名            | Shiki 言語 ID |
| --------------------- | ------------- |
| sh                    | shellscript   |
| bash                  | bash          |
| zsh                   | zsh           |
| fish                  | fish          |
| python, python3       | python        |
| ruby                  | ruby          |
| perl, perl5           | perl          |
| perl6, raku           | perl6         |
| node                  | javascript    |
| lua, luajit           | lua           |
| php                   | php           |
| awk, gawk, mawk, nawk | awk           |
| Rscript               | r             |
| groovy                | groovy        |
| scala                 | scala         |
| elixir                | elixir        |
| erlang, escript       | erlang        |
| crystal               | crystal       |
| julia                 | julia         |
| swift                 | swift         |
| dart                  | dart          |
| nim                   | nim           |
| tcl, tclsh, wish      | tcl           |
| ocaml                 | ocaml         |
| racket                | racket        |
| scheme                | scheme        |
| fennel                | fennel        |
| nu, nushell           | nushell       |
| ts-node               | typescript    |
| deno                  | typescript    |
| bun                   | javascript    |

### 5. `shellscript` と `bash` について

既存の `EXTENSION_TO_LANGUAGE` では `.sh` を `bash` にマッピングしている。
一方、shebang `#!/bin/sh` は POSIX sh を意味するため `shellscript` に
マッピングする。

Shiki においては `shellscript` は `bash` の grammar エイリアスであり、
同じ TextMate grammar でハイライトされるため、実際の表示に差異は生じない。
意味的には正確な使い分けとなる。

### 6. `inferLanguageFromShebang` の可視性

現時点では `inferLanguage` 経由でのみ使用されるため、export せず
モジュール内部関数とする。将来 diff-service 等から直接利用する
必要が生じた場合に export を検討する。

### 7. diff-service での対応

diff-service はパッチ内容のみを扱い、ファイルの先頭行を直接持たない。
パッチに先頭行が含まれる保証がないため（ファイル途中のみの変更時）、
パッチからの推定は行わない。

代わりに、diff-service に `BlobReader` を DI し、new 側リビジョンの
ファイル先頭行を読み取る。DiffRange の種類に応じた rev の特定:

- `working-vs-head` / `working-vs-rev` → working tree (rev=null)
- `rev-vs-rev` → to リビジョン

BlobReader が null を返す場合（削除ファイル等）はパスベース判定のみ。

## 影響

- `inferLanguage` のシグネチャ変更は後方互換（第2引数オプショナル）
- blob-service は先頭行を渡すよう呼び出しを変更
- diff-service に `BlobReader` を第3引数として注入。ファイル先頭行の取得に使用
- main.ts で `blobReader` の生成順序を `diffService` 生成前に移動
- `EXTENSION_TO_LANGUAGE` に shebang 対象言語の拡張子を追加（既存判定に影響なし）
