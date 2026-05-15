# 0053. common に純粋共有定数・関数を置くことを許容する

## ステータス

承認済み

## 文脈

ADR 0006 では「common には実行時コードを置かない（純粋に `.d.ts` 相当の型定義のみ）」と決定し、ADR 0011 §規約補遺で「common に置くのは DTO のみ」と限定した。

ADR 0052 で画像表示の判定方針を補正した際、画像拡張子の集合 (`IMAGE_EXTENSIONS`) と拡張子→Content-Type の対応 (`EXTENSION_MAP`) がフロント / API の両方で重複定義される構造になった。両者は意味的に同一の参照テーブルであり、片方だけ追加するとデグレを生むため、ADR 0052 §3 で「変更は常に同期する」という運用ルールで担保していたが、コード上の保証はない。

実装安全性評価で「コードレベルで担保するなら common への共通化が望ましい」との指摘があり、ユーザーから共通化の方針承認を得た。

## 決定

### 1. common に置けるものを拡張する

ADR 0006 / 0011 の「DTO のみ」制約を緩和し、以下のいずれにも該当する純粋なコードを common に置けることとする:

- 副作用を一切持たない (I/O / 時刻 / 乱数 / 外部 API 呼び出しなし)
- 外部ライブラリに依存しない (TypeScript / ECMAScript 標準のみ)
- フロント / API の両方で意味的に同一の値・振る舞いになる
- ビジネスドメイン概念ではなく、技術的事実 (拡張子マッピング、URL パス整形、共通の正規表現等) を表現する

### 2. common に置くべきでないもの (継続して禁止)

- API ハンドラ / コントローラ / サービス層のロジック
- ドメインモデル (ADR 0011 §規約補遺の禁止を継承。ドメインは `packages/api/src/domain/` に置く)
- ファイル I/O / HTTP 通信 / DOM 操作などの副作用
- 外部ライブラリラッパー (adapter 層に置く)

### 3. 本 ADR で実施する具体作業

`packages/common/src/image-extension.ts` を新設し、以下を export する:

- `IMAGE_EXTENSION_TO_MIME: ReadonlyMap<string, string>` (single source of truth)
- `isImageExtension(path: string): boolean`
- `inferImageContentType(path: string): string | null` (画像でなければ null)

フロント `blob-content-state.ts` の `IMAGE_EXTENSIONS` / `isImagePath` と、API `content-type.ts` の `EXTENSION_MAP` から派生していたロジックは、いずれも common 経由に切り替える。

### 4. ガードレール

common に新規ファイルを追加する際は、本 ADR §1 の条件をすべて満たすことをコードレビューで確認する。判断に迷う場合は ADR 0011 のレイヤ分離原則 (ドメインかどうか / 副作用の有無) を優先する。

## 結果

### メリット

- 拡張子マップが single source of truth になり、追加忘れによるデグレを防げる
- 型だけでなく純粋なロジックも共有できることで重複実装が減る

### デメリット

- common の責務が「DTO のみ」から広がるため、何を置くべきかの判断基準が増える (§4 のガードレールで対処)
- common に副作用・外部依存が混入するリスク (継続して禁止項目を §2 に明記)

## 関連

- ADR 0006: 型共有を common パッケージで実現する (本 ADR で「実行時コード禁止」を緩和)
- ADR 0011: api パッケージのレイヤ構造を定義する (本 ADR で §規約補遺の「DTO のみ」を緩和。ドメインモデル禁止は維持)
- ADR 0052: SVG 等のテキストベース画像を `<img>` 経由で表示する (本 ADR で §3 の運用ルールをコード上で担保)
