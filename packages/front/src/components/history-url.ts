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

/**
 * worktree モードでの history 遷移時に rev クエリへ渡す値を解決する (ADR 0056 §3, §4)。
 *
 * - wt=null (default worktree): null を返し rev クエリを省略する (CommitsView 側で HEAD 解決)
 * - wt=<name> (linked worktree): worktrees list から該当アイテムの headHash を返す
 * - linked worktree 選択中で worktrees list 未解決 / 該当アイテム不在 / headHash null:
 *   null を返す。呼び出し側はこれを「リンク不可」として扱う
 *
 * worktrees パラメータは `WorktreeListItemDto` の必要最低限の形状だけを要求する。
 * これによりこの関数は副作用なし・依存最小でテストできる。
 */
export function resolveHistoryRev(
  currentWt: string | null,
  worktrees: ReadonlyArray<{ readonly name: string; readonly headHash: string | null }> | null,
): string | null {
  if (currentWt === null) return null
  if (worktrees === null) return null
  const item = worktrees.find((w) => w.name === currentWt)
  if (item === undefined) return null
  return item.headHash
}
