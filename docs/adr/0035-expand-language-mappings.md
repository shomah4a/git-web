# 0035. Shiki 対応言語の拡張子マッピング一括追加

## ステータス

承認済み (実装完了、2026-04-14)

## コンテキスト

Shiki 4.0.2 は 332 言語をバンドルしているが、本プロジェクトの `EXTENSION_TO_LANGUAGE` は約 45 拡張子しかカバーしていなかった。HCL/Terraform をはじめ、C/C++、Haskell、F# など広く使われる言語が未対応のままだった。

Shiki は `loadLanguage` で必要な言語のみを動的にロードするため、マッピングを増やしてもバンドルサイズや初期化コストに影響しない。`EXTENSION_TO_LANGUAGE` は `Record<string, string>` のプロパティアクセスで参照されるため、エントリ数増加による計算量の変化もない（O(1)）。

## 決定

Shiki の `bundledLanguages` に存在する言語 ID を対象に、明確なファイル拡張子を持つものを `EXTENSION_TO_LANGUAGE` に一括追加する。`FILENAME_TO_LANGUAGE` には `dockerfile` と `justfile` を追加する。

### 曖昧な拡張子のスキップ

以下の拡張子は複数言語で競合するためマッピングしない。

| 拡張子 | 候補                 | 理由                 |
| ------ | -------------------- | -------------------- |
| `.m`   | Objective-C / MATLAB | 両方とも広く使われる |
| `.v`   | V / Verilog / Coq    | 3 言語で競合         |
| `.pp`  | Pascal / Puppet      | 両方とも一般的       |
| `.pro` | Prolog / Qt project  | 用途が異なる         |

### `.h` 拡張子について

`.h` は C ヘッダと C++ ヘッダの両方で使われるが、C と C++ の TextMate grammar はハイライト上おおむね互換性があるため `c` にマッピングする。

### `perl6` 言語 ID について

Shiki は `perl6` を言語 ID として使用しているが、言語自体は Raku にリブランドされている。Shiki が将来的に ID を変更した場合は追従が必要。

## 影響

- `packages/api/src/domain/language.ts`: マッピング追加（ロジック変更なし）
- `packages/api/src/domain/language.test.ts`: テストケース追加
