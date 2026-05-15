/**
 * ファイル単位 history (`/commits?path=`) への遷移先 URL を組み立てる (ADR 0056)。
 *
 * 設計方針:
 * - vue-router の `RouteLocationRaw` を返し、`encodeURIComponent` の手書きを避ける
 * - rev が null または 'HEAD' のときは rev クエリを省略する (CommitsView 側で HEAD として扱われるため)
 * - path は必須。空文字を渡してはならない (呼び出し側でガード)
 */

import type { RouteLocationRaw } from 'vue-router'

export function buildHistoryUrl(rev: string | null, path: string): RouteLocationRaw {
  const query: Record<string, string> = { path }
  if (rev !== null && rev !== '' && rev !== 'HEAD') {
    query.rev = rev
  }
  return { path: '/commits', query }
}
