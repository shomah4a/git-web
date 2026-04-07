/**
 * 静的ファイル配信ハンドラのスタブ。
 *
 * 将来的に packages/front/dist をブラウザに配信するためのエンドポイント。
 * front パッケージが追加されるまではプレースホルダとして 404 を返す。
 *
 * ADR 0009: 配信元パスはクライアント入力から合成しない。必ず dist の
 * 絶対パスを prefix として正規化後にスコープ確認を行う。現時点では
 * スタブのため該当ロジックは未実装。
 */

import type { Handler } from './router.js'

/**
 * 静的ファイル配信ハンドラを生成する。
 * 現時点ではスタブ実装で、常に 404 を返す。
 */
export function createStaticHandler(): Handler {
  return () => ({
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'static assets not available yet',
  })
}
