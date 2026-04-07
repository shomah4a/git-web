# 0004. フロントエンド FW に Vue 3 + Vite を採用する

## ステータス

承認済み

## 文脈

git-web のフロントは log / diff / commit graph などを表示するシングルページアプリケーションになる。
利用者（開発者本人）はフロントエンド経験が限定的で、業務では Angular を使用しているが「Spring Framework くらい大仰」と感じている。

候補:

- React: エコシステム最大、ただし状態管理ライブラリ・ビルド構成の選択肢が多く初学者には地雷が多い
- Vue 3: SFC で HTML に近い書き味、Composition API + `<script setup>` で TS 親和性高、公式ドキュメントが日本語完備
- Svelte: コンパイラ系、エコシステムは小さめ
- Solid: 高性能だがエコシステムが最も小さい
- Angular: 業務経験ありだが、DI / NgModule / RxJS 必須で今回の規模に対して大仰

## 決定

Vue 3 + Vite + TypeScript（`<script setup>`）を採用する。

初期段階では以下も方針として決める:

- 状態管理ライブラリ（Pinia 等）は導入しない。`ref` / `reactive` で十分なうちは標準機能で済ませる
- ルーティング（Vue Router）は画面が増えるまで導入しない
- UI コンポーネントライブラリは導入しない（必要になったら別 ADR）

## 結果

- Angular ほどの構造強制が無く、薄い `node:http` 側の API と釣り合いが取れる
- HMR の速い Vite で開発体験が良い
- フロント FW に対する学習コストが最小
- diff 表示・commit graph 表示用ライブラリは FW 非依存のもの（`diff2html`, `@gitgraph/js` 等）が候補にあるため FW 選択による制約は薄い
