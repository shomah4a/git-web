/**
 * `wt` クエリ値 → BoundedWorktreePath の解決を担う resolver (ADR 0055 §3, §7)。
 *
 * 設計:
 * - worktrees-list-service を再利用してリスト取得 (bare/submodule 除外済み)
 * - TTL 5 秒のメモ化。`git worktree add/remove` 後の追従は最大 5 秒遅延
 * - 未知 name は invalidate して 1 回再フェッチ。それでも見つからなければ null
 * - 現在時刻取得 (now) は注入式 (テスト容易性のため)
 */

import { resolve as resolvePath } from 'node:path'
import type { WorktreeListItem, WorktreesListService } from '../service/worktrees-list-service.js'
import { unsafeBuildBoundedWorktreePath, type BoundedWorktreePath } from './worktree-path.js'

const DEFAULT_TTL_MS = 5000

export type WorktreeContext = {
  readonly name: string
  readonly path: BoundedWorktreePath
  readonly isDefault: boolean
}

export type WorktreeContextResolver = {
  /**
   * `wt` クエリ値を BoundedWorktreePath に解決する。
   *
   * - `wtName === null`: default worktree を返す
   * - 既知 name: 対応する context
   * - 未知 name (キャッシュ TTL 内): invalidate して再フェッチ後も見つからなければ null
   */
  resolve(wtName: string | null): Promise<WorktreeContext | null>

  /**
   * default worktree (= 起動時 cwd に対応する worktree)。
   * 起動時に必ず resolve できることを保証する (起動時 fail-fast)。
   */
  getDefault(): Promise<WorktreeContext>
}

export type WorktreeContextResolverDeps = {
  readonly service: WorktreesListService
  /** 起動時 cwd の realpath。default の同定に使う */
  readonly defaultWorktreePath: string
  /** Date.now 相当。テスト時に注入する */
  readonly now: () => number
  /** TTL [ms]。デフォルト 5 秒 */
  readonly ttlMs?: number
}

type CacheState = {
  readonly items: ReadonlyArray<WorktreeListItem>
  readonly fetchedAt: number
}

export function createWorktreeContextResolver(
  deps: WorktreeContextResolverDeps,
): WorktreeContextResolver {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS
  const normalizedDefault = resolvePath(deps.defaultWorktreePath)
  let cache: CacheState | null = null
  let inflight: Promise<ReadonlyArray<WorktreeListItem>> | null = null

  async function load(forceRefresh: boolean): Promise<ReadonlyArray<WorktreeListItem>> {
    if (!forceRefresh && cache !== null && deps.now() - cache.fetchedAt < ttlMs) {
      return cache.items
    }
    if (inflight !== null) {
      return inflight
    }
    inflight = (async () => {
      const items = await deps.service.listWorktrees()
      cache = { items, fetchedAt: deps.now() }
      return items
    })()
    try {
      return await inflight
    } finally {
      inflight = null
    }
  }

  function findByName(
    items: ReadonlyArray<WorktreeListItem>,
    name: string,
  ): WorktreeListItem | null {
    for (const item of items) {
      if (item.name === name) return item
    }
    return null
  }

  function findDefault(items: ReadonlyArray<WorktreeListItem>): WorktreeListItem | null {
    for (const item of items) {
      if (item.path === normalizedDefault) return item
      if (item.isDefault) return item
    }
    return null
  }

  function toContext(item: WorktreeListItem): WorktreeContext {
    return {
      name: item.name,
      path: unsafeBuildBoundedWorktreePath(item.path),
      isDefault: item.isDefault,
    }
  }

  return {
    async resolve(wtName) {
      let items = await load(false)
      if (wtName === null) {
        const def = findDefault(items)
        return def === null ? null : toContext(def)
      }
      let item = findByName(items, wtName)
      if (item === null) {
        // 未知 name はキャッシュを無効化して 1 回だけ再フェッチを試みる
        items = await load(true)
        item = findByName(items, wtName)
      }
      return item === null ? null : toContext(item)
    },
    async getDefault() {
      const ctx = await this.resolve(null)
      if (ctx === null) {
        throw new Error(
          `default worktree '${normalizedDefault}' was not found in 'git worktree list'`,
        )
      }
      return ctx
    },
  }
}
