/**
 * worktrees-list のユースケース層 (ADR 0055)。
 *
 * 役割:
 * - GitWorktreeListClient から取得した WorktreeInfo を整形する
 * - bare / 解決不能 path を除外する
 * - worktree 識別子 `name` を realpath ベースの basename + 衝突回避で発行する
 * - main worktree / default worktree (= 起動時 cwd) のマークを付ける
 *
 * 副作用 (fs.realpath) は引数で注入する。
 */

import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import type { GitWorktreeListClient } from '../domain/ports/git-worktree-list-client.js'
import type { WorktreeInfo } from '../domain/worktree-info.js'

/**
 * 識別子の文字制約 (ADR 0055 §7-1)。
 * URL-safe な basename を前提とし、`/`, `\`, `\0`, `..` を含むものは除外する。
 *
 * 注: 日本語など Unicode 文字は許容する。RFC 3986 reserved char / control char のみ拒否する。
 */
export function isValidWorktreeName(name: string): boolean {
  if (name.length === 0 || name.length > 256) return false
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false
  if (name.includes('..')) return false
  // 制御文字 (C0 / C1) は禁止
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false
  }
  return true
}

export type RealpathFn = (path: string) => Promise<string>

/**
 * service が返す worktree の表示用情報。
 * Dto への変換は controller 層で行う。
 */
export type WorktreeListItem = {
  readonly name: string
  /** realpath 解決済み絶対パス */
  readonly path: string
  readonly headHash: string | null
  readonly branchRef: string | null
  readonly isDetached: boolean
  readonly isDefault: boolean
  readonly isMain: boolean
}

export type WorktreesListService = {
  listWorktrees(): Promise<ReadonlyArray<WorktreeListItem>>
}

/**
 * service の依存。
 *
 * @property defaultWorktreePath 起動時に realpath 解決済みの default worktree 絶対パス
 */
export type WorktreesListServiceDeps = {
  readonly client: GitWorktreeListClient
  readonly realpath: RealpathFn
  readonly defaultWorktreePath: string
}

export function createWorktreesListService(deps: WorktreesListServiceDeps): WorktreesListService {
  return {
    async listWorktrees() {
      const raw = await deps.client.listWorktrees()
      return resolveAndShape(raw, deps.realpath, deps.defaultWorktreePath)
    },
  }
}

async function resolveAndShape(
  raw: ReadonlyArray<WorktreeInfo>,
  realpathFn: RealpathFn,
  defaultWorktreePath: string,
): Promise<ReadonlyArray<WorktreeListItem>> {
  // bare は除外 (作業ツリーを持たないため)
  const candidates: { info: WorktreeInfo; resolvedPath: string }[] = []
  for (const info of raw) {
    if (info.isBare) continue
    try {
      const resolved = resolve(await realpathFn(info.path))
      candidates.push({ info, resolvedPath: resolved })
    } catch {
      // realpath 失敗 (worktree ディレクトリ削除済み等) は除外
    }
  }

  // basename での衝突を集計し、衝突するものは全員に hash サフィックスを付ける
  const basenameCounts = new Map<string, number>()
  for (const c of candidates) {
    const b = basename(c.resolvedPath)
    basenameCounts.set(b, (basenameCounts.get(b) ?? 0) + 1)
  }

  // main worktree は git worktree list の先頭エントリ
  const result: WorktreeListItem[] = []
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    if (candidate === undefined) continue
    const { info, resolvedPath } = candidate
    const b = basename(resolvedPath)
    const isCollision = (basenameCounts.get(b) ?? 0) > 1
    const name = makeName(b, resolvedPath, isCollision)
    if (!isValidWorktreeName(name)) {
      // 識別子に使えない basename は除外する (defense in depth)
      continue
    }
    result.push({
      name,
      path: resolvedPath,
      headHash: info.headHash,
      branchRef: info.branchRef,
      isDetached: info.isDetached,
      isDefault: resolvedPath === defaultWorktreePath,
      isMain: i === 0,
    })
  }
  return result
}

function makeName(basenamePart: string, resolvedPath: string, isCollision: boolean): string {
  if (!isCollision) return basenamePart
  const hash = createHash('sha1').update(resolvedPath).digest('hex').slice(0, 8)
  return `${basenamePart}-${hash}`
}
