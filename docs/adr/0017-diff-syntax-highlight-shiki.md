# 0017. diff 構文ハイライト (Shiki + 全文トークン化)

## ステータス

承認済み (実装完了、2026-04-09)

改訂履歴:

- v1: 初稿。防衛的計画評価で HIGH 3 件 + MEDIUM 6 件 + LOW 6 件を受領
- v2: 防衛評価を全件反映。Shiki API (4.0.2) を実査した結果で設計を具体化
- v3 (本版): 実装完了後の訂正
  - `bash` は BundledLanguage リテラルに直接含まれており `shellscript`
    エイリアス経由不要だったため訂正
  - `codeToTokens` の末尾改行仕様について実測 cross-check した結果を
    反映 (Shiki は末尾 LF で空行を含め、空文字入力でも `[[]]` を返す)
  - 実装安全性評価後の改善 (enrichHunk 統合、TextEncoder バイト数、
    regex 改行カウント) を帰結節に追記
  - 計画書では step 7 (runDiffLoad 集約) と step 8 (描画差し替え) を
    分離する想定だったが、tokenMap を宣言しつつ描画で使わないと
    eslint の no-unused-vars で弾かれるため実装では 1 コミットに統合

## 文脈

ADR 0016 で `/api/blob?path=&rev=` エンドポイントを追加し、両サイドのファイル全文を front に取得できるようにした。本 ADR はその後段として、front で全文をハイライトし diff 行にマッピングする実装方針を定める。

背景整理:

- diff の hunk 内容だけをハイライトする方式は、複数行文字列 / 複数行コメント / markdown fenced code block / テンプレート文字列等の「文脈依存構文」が hunk 境界で崩れる
- GitHub / GitLab / VS Code はいずれも「ファイル全体をハイライトしてから diff にマッピング」する戦略 (C 方式)
- git-web でも C 方式を採用することを ADR 0016 で決定済み

本 ADR の対象:

- 構文ハイライトライブラリの選定
- front 側のアーキテクチャ (Highlighter port の DI、tokenMap のライフサイクル、race 処理、scroll 同期との両立、大容量ファイル fallback)
- ファイル状態別 (added / deleted / modified / binary / 言語不明 / 大容量) の fallback

## 決定

### ライブラリ: Shiki 4.0.2

選定理由:

- VS Code と同じ TextMate grammar ベースで、packages/api/src/domain/language.ts の言語識別子はすでに Shiki を意識して揃えてある
- `codeToTokens` がトークン列を object として返すため `v-html` を使わず描画できる (ADR 0009 の XSS 対策方針と親和)
- 後から言語を動的ロードでき、初期バンドルを肥大させない

依存追加: **`shiki@4.0.2` 単体**で済む。`@shikijs/core` / `@shikijs/langs` / `@shikijs/engine-oniguruma` などは `shiki` の dependencies として自動解決される (実査済: `./bin/pnpm view shiki dependencies`)。

### Shiki API の実査結果 (4.0.2)

| API                                               | 署名 / 戻り値                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `createHighlighter(opts)`                         | **async**。`Promise<Highlighter>` を返す                          |
| `getSingletonHighlighter`                         | 公式推奨シングルトンヘルパ。内部で `createHighlighter` を memoize |
| `highlighter.codeToTokens(code, { lang, theme })` | **同期**。`{ tokens: ThemedToken[][] }` を返す (行ごとの配列)     |
| `highlighter.loadLanguage(lang)`                  | async。`Promise<void>`。失敗は reject                             |

### bundledLanguages 対応状況 (本プロジェクトで使う 18 言語)

| 言語 id (language.ts)    | Shiki 4.0.2 での対応 |
| ------------------------ | -------------------- |
| typescript / tsx         | あり                 |
| javascript / jsx         | あり                 |
| vue                      | あり                 |
| python                   | あり                 |
| rust / go / java         | あり                 |
| kotlin                   | あり                 |
| ruby                     | あり                 |
| bash                     | あり (直接)          |
| markdown                 | あり                 |
| json / yaml / html / css | あり                 |
| toml                     | あり                 |

全て silent fallback 不要で色が付く。v2 時点では `bash` が `shellscript` のエイリアスとして解決される前提で書いていたが、Shiki 4.0.2 の `BundledLanguage` リテラルユニオンには `'bash'` が直接含まれていることを d.ts 実査で確認済。`shellscript` 経由にする必要はない。

### マッピング戦略

1. `DiffView` が `/api/diff/files` → 各ファイルの `/api/diff/file` 取得を完了したあと、**`status` と `binary` と `language` と `size` をチェックして**、ハイライト対象ファイルに対してのみ `/api/blob` を取得する
2. `/api/blob?path=<path>&rev=HEAD` (old) と `/api/blob?path=<path>` (new, worktree) をステータス別に取得
3. 各サイドの `content` を Shiki `codeToTokens` に掛け、ファイル全体 → 行 index 配列 (`ThemedToken[][]`) として受け取る
4. `HighlightedToken[]` に変換 (color は `#rrggbb` / `#rrggbbaa` ホワイトリスト)
5. **全ファイルの処理が終わってから** `tokenMap.value` を 1 回だけ差し替える (バッチ更新)
6. 描画時、`DiffLine.oldLineNo` / `newLineNo` を使って `oldTokens[lineNo-1]` / `newTokens[lineNo-1]` を引く
7. 引けない行 (context の空セル / マッピング失敗 / 対象外ファイル) はプレーン `content` をそのまま表示

### ファイルステータス別の blob 取得

| status     | old (HEAD) | new (worktree) | 備考                                                    |
| ---------- | ---------- | -------------- | ------------------------------------------------------- |
| `modified` | 取得する   | 取得する       |                                                         |
| `added`    | 取得しない | 取得する       | old 行は存在しないため                                  |
| `deleted`  | 取得する   | 取得しない     | new 行は存在しないため                                  |
| `renamed`  | 取得する   | 取得する       | 現状 rename の oldPath 情報は DTO に無い。modified 相当 |
| `copied`   | 取得する   | 取得する       | 同上                                                    |

次の条件のいずれかに該当するファイルは blob 取得自体をスキップし、プレーン描画にフォールバックする:

- `binary === true`
- `language === null`
- `/api/diff/file` の取得が失敗しているファイル (それに依存して描画しない)
- サイズ閾値超過 (下記)

### 大容量ファイルの閾値

初版から **silent fallback 閾値**を設ける:

- `new TextEncoder().encode(content).length > 512 * 1024` (UTF-8 で 512KB) または 行数 > 5000 の場合、該当サイドはプレーン
- 閾値判定は `fetchBlob` 取得後の content に対して実施
- 閾値超過の原因は front の console に warn を出す (デバッグ容易性)

バイト数判定は UTF-8 の実バイト数を使う。v2 時点では `content.length` (UTF-16 コード単位) を書いていたが、実装安全性評価 (MEDIUM-4) で日本語中心ファイルの閾値が実質 1/3 まで緩む問題が指摘されたため、TextEncoder ベースに訂正した。行数カウントは `content.match(/\n/g)?.length ?? 0` を用いる (for..of の surrogate 再構成コストを回避、LOW-3)。

将来の調整余地として ADR 末尾に「閾値は運用で見直す」と記す。ユーザー依頼は「バンドルサイズは気にしない」だが、Shiki の wasm grammar に巨大ファイルを流すと UI がフリーズするため初版から守る。

### Highlighter port

front は Shiki に直接依存せず、`Highlighter` インターフェイス経由で呼ぶ。

```ts
// packages/front/src/diff/highlighter/types.ts
export type HighlightedToken = {
  readonly content: string
  readonly color: string | null // null = プレーン
}

export type Highlighter = {
  // lang のロード。未対応 / 失敗時は silent で resolve (プレーン fallback 方向)
  preload(lang: string): Promise<void>
  // ファイル全体を行配列に分割してトークン化する。失敗時は null を返す (呼び出し側でプレーン fallback)
  highlightFile(
    content: string,
    lang: string,
  ): Promise<ReadonlyArray<ReadonlyArray<HighlightedToken>> | null>
}

import type { InjectionKey } from 'vue'
export const highlighterKey: InjectionKey<Highlighter> = Symbol('highlighter')
```

実装:

- `createShikiHighlighter(): Highlighter` は **同期** factory。top-level await は使わない
- 内部で `instancePromise: Promise<ShikiHighlighter> | null` を lazy 初期化する
- `preload(lang)` で `instancePromise ??= getSingletonHighlighter({ themes: ['github-light'], langs: [] })` を実行し、`loadedLangs: Map<string, Promise<void>>` でメモ化
- `highlightFile(content, lang)` は `await this.preload(lang)` → 同期的に `inst.codeToTokens` を呼ぶ
- 変換時、`color` は `/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/` のホワイトリスト通過のみ採用、それ以外は `null`
- いかなる例外も呼び出し側に漏らさず `null` を返す (fallback)
- 戻り値の配列 index = 行番号 (0 始まり)、空行は `[]`
- Shiki テーマは初版 `github-light` 固定。**背景色は無視**し前景色のみ適用 (add/delete の背景色との衝突回避)

本番は `createShikiHighlighter()`、テストは `createNoOpHighlighter()`。no-op は Shiki の `codeToTokens` の行配列挙動に合わせて返す (`content.split('\n')` で行に分解し、各行を `[{ content, color: null }]` or 空行は `[]` で返す)。

**末尾改行の仕様** (実装直前の cross-check で確定): Shiki 4.0.2 の `codeToTokens` は以下の挙動を示す。v2 時点の想定 (trailing LF で空行を含めない) と逆で、no-op もこれに合わせている。

- 空文字 `""` → `tokens: [[]]` (長さ 1 の空行 1 つ)
- `"a"` → `tokens: [[{ content: 'a', ... }]]`
- `"a\nb\nc"` → 3 行
- `"a\nb\nc\n"` → **4 行** (末尾に空行 `[]` が付く)
- `"a\n\nb"` → 3 行 (真ん中が空行 `[]`)

実用上、余分な末尾空行は DiffLine の行番号でアクセスされないため描画には影響しない。no-op と Shiki の行数が一致することで、単体テストの cross-check が可能になる。

### DI: InjectionKey 統一

`app.provide(highlighterKey, createShikiHighlighter())` とし、文字列キーは使わない (ADR 0010: 型安全)。`main.ts` と `DiffView.vue` で同じ `InjectionKey<Highlighter>` を共有する。

**テスト側の注入方法**:

Vue Test Utils の `mount(C, { global: { provide: ... } })` は `InjectionKey<T>` (Symbol) を key とする object を型安全に受けにくい。本プロジェクトではテストヘルパ `mountWithHighlighter(component, highlighter?, mountOptions?)` を `packages/front/src/test-utils/mount-with-highlighter.ts` に用意し、型キャストを 1 箇所に閉じ込める。DiffView.test.ts はこのヘルパ経由でマウントする。

### race 条件の扱い: 世代カウンタ + バッチ更新

本タスクで発生する race は:

1. `entries` 再差し替え中に、先に投げた blob fetch / highlightFile が後から resolve
2. 同一 path の blob fetch / highlightFile が重複 dispatch される

対策:

- 非同期処理の entrypoint を **単一の async 関数** (`runDiffLoad`) に集約する。`onMounted` (と将来の差し替え watch) はこの関数のみを呼ぶ
- `runDiffLoad` 内で `const myGen = ++generation` を取る
- 差し替えのタイミングで `entries.value = ...` と同期に `tokenMap.value = new Map()` (クリア) を行う
- diff file → blob 取得 → highlightFile を順に実行するが、**全ファイルのトークン化結果を一旦ローカルに集めてから**、`myGen === generation` のチェックを通ったときに限り `tokenMap.value` を 1 回だけ差し替える (バッチ更新)
- 途中で `generation` が進んだ場合は結果を破棄 (後発優先、ADR 0015 と整合)

これにより、watch から tokenMap を外すこともでき、O(N²) の reactivity フラッシュは発生しない。

### blob fetch の同時実行数制限

ADR 0014 は `/api/diff/file` を N 並列で取得しているが、本タスクではこれに加えて最大 2N の blob fetch が走る。ローカル http サーバが connection pool に詰まる事故を避けるため、**blob fetch は簡易 limiter で 6 並列固定**とする。

- 依存は増やさず、`packages/front/src/diff/highlighter/limit.ts` に 50 行程度の簡易 pool 実装を置く
- diff file 取得は従来どおり (ADR 0014 の無制限並列のまま)
- 将来 dev server の負荷問題が顕在化したら diff file 側にも limiter を拡張する余地を残す (ADR 0014 との整合は後続 ADR で)

### scroll 同期の再 setup は**不要**

防衛評価 H1 の指摘に従い検証した結論: **scroll sync 再 setup は不要**。

理由:

- `.side-left` / `.side-right` の DOM ノードはトークン描画切替の前後で同一 (v-for の `<article>` / `<div class="side ...">` はファイル key で維持される)
- `.row-content` の子 `<span>` が増減するだけで、scroll イベントリスナが attach されている DOM は変化しない
- `.side-inner` の `width: max-content` は CSS layout が自動で再計算する

したがって `watch` の依存は従来どおり `entries` のみ。tokenMap は watch に入れない。

### scroll 位置の保持 (防衛評価 M3 対応)

ただし max-content の幅がわずかに変わる瞬間、ブラウザが `scrollLeft` を clamp し直して意図せず左に戻る可能性はある。対策として:

- tokenMap を差し替える直前に、対象ファイル群の `.side-left` / `.side-right` の `scrollLeft` / `scrollTop` を Map に退避
- 差し替え後、`nextTick` で保存値を書き戻す
- window 全体の `scrollY` は本実装では退避・復元しない。本実装は各行の高さを変えないため window 位置は変動しない。jsdom が `window.scrollTo` を実装していないため try/catch で吸収できないことも理由の 1 つ

### 非同期初期化の同期 factory (念押し)

- `createShikiHighlighter()` は **同期** return
- 内部 `instancePromise` は初回 `preload` でのみ生成される
- `main.ts` トップレベルで top-level await を使わない
- `DiffView` 側は `highlighter.preload(lang)` を await するが、これは onMounted の async 関数内で行う

### セキュリティ

- `v-html` は使わない。トークンは `v-for` + `<span :style="{ color }">{{ token.content }}</span>` (Vue の自動エスケープ)
- color は `#rrggbb` または `#rrggbbaa` ホワイトリストのみ通し、不正な値は `null` に倒す (過剰防衛)
- blob endpoint 側のセキュリティ境界 (ADR 0009, 0016) は既存のまま利用

### 非ゴール (本 ADR スコープ外)

- ダークテーマ / テーマ切替 UI
- word-diff ハイライト
- rename 情報の正式サポート (`oldPath` 復活は ADR 0012 既知制限として持ち越し)
- commit 指定の diff (`from=&to=`) 時の blob rev 指定 (初版は worktree vs HEAD 固定)
- diff file fetch 自体の同時実行制限 (ADR 0014 の範囲外)

## 帰結

- front は `/api/blob` に 2N のリクエストを投げる (old + new、ステータス別)。同時実行は 6 並列に制限
- 文脈依存構文は解消される (ファイル全文トークン化)
- Highlighter を port 化することで、Shiki の wasm 初期化を単体テストに持ち込まない (no-op 注入)
- 世代カウンタ + バッチ更新で race は後発優先に統一、tokenMap watch は廃止
- scroll sync の再 setup は不要。ただし tokenMap 差し替え前後で `.side-*` の scrollLeft / scrollTop を保存/復元 (window 全体のスクロール位置は不要)
- 512KB (UTF-8 バイト) または 5000 行の閾値により、大容量 minified JS / lockfile / 生成物の UI フリーズを回避

### 実装完了後の追加調整 (v3)

実装安全性評価を受けて以下を追加した:

- 行描画を `enrichHunk(path, hunk)` に統合。template からの `tokensFor` 呼び出しを 1 行あたり 4 回 → 1 回に削減し、`pairLines(hunk.lines)` の 2 回呼び出しも左右共通の 1 回に統合した (MEDIUM-3)
- `loadingList.value = false` を entries 成功代入の直後に前倒した。これは後述する「watch の post flush callback が runDiffLoad 後半の await と競合する」問題の回避で、`<p>loading...</p>` が残ったまま setupScrollSync が呼ばれると `.hunk-content` が DOM に無い状態で空振りする事故を避けるため
- `isTooLarge` のバイト数判定を UTF-8 (TextEncoder) に変更 (MEDIUM-4)
- `isTooLarge` の改行カウントを regex に変更 (LOW-3)

### テストでの InjectionKey 注入運用

Vue Test Utils の `mount(C, { global: { provide: ... } })` は `InjectionKey<T>` (Symbol) を型安全に受けにくいため、`packages/front/src/test-utils/mount-with-highlighter.ts` にヘルパを用意し、型の揺れを 1 箇所に閉じ込める。DiffView.test.ts の既存 mount 呼び出しはすべてこのヘルパ経由に置換済。ADR 0010 (`as` 禁止) への整合は保たれている。

## 関連 ADR

- 0009: セキュリティ境界 (blob endpoint 側で既に適用)
- 0010: 型安全 (InjectionKey 統一)
- 0011: API レイヤリング (本タスクは front 側のみ)
- 0012: diff 表示アーキテクチャ (language 識別子、既知制限)
- 0014: 全ファイル並列取得 (本タスクで blob fetch が追加されるが、diff file 側の並列は既存のまま)
- 0015: Split View / scroll 同期 (tokenMap 差し替え時の scroll 位置保持)
- 0016: `/api/blob` エンドポイント追加
