# chromeless トグルのブラウザバック修正

## セッション概要

- 印刷ビュー（chromeless モード）のトグル後にブラウザバックで戻れない不具合を修正した
- 原因: `use-chromeless.ts` で `router.replace` を使用していたため、ブラウザ履歴が上書きされていた
- 修正: `router.replace` → `router.push` に変更（ADR 0031 と同じ方針）
- ADR 0039 の実装方針記述も修正し、ADR 0031 へのリンクを追記
- ブランチ: `fix/chromeless-browser-back`

## TODO

- main へのマージ
