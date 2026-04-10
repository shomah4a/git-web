/**
 * `git status --porcelain=v1 -z` の出力をパースする (ADR 0022)。
 *
 * フォーマット: `XY <path>\0` の繰り返し。
 * rename の場合: `XY <new_path>\0<old_path>\0`。
 *
 * X = index status, Y = worktree status。
 */

import type { TreeEntryStatus } from '../../domain/tree.js'

export type StatusEntry = {
  readonly path: string
  readonly status: TreeEntryStatus
}

/**
 * `git status --porcelain=v1 -z` の stdout をパースして
 * パス→ステータスの Map を返す。
 */
export function parseStatusZ(stdout: string): ReadonlyMap<string, TreeEntryStatus> {
  if (stdout.length === 0) {
    return new Map()
  }

  const result = new Map<string, TreeEntryStatus>()
  const parts = stdout.split('\0')

  let i = 0
  while (i < parts.length) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) {
      // 空文字列や短すぎるエントリはスキップ
      i++
      continue
    }

    const x = entry.charAt(0)
    const y = entry.charAt(1)
    // entry[2] は空白
    const path = entry.slice(3)
    const status = resolveStatus(x, y)

    if (status !== null && path.length > 0) {
      result.set(path, status)
    }

    // rename の場合は次のパートが old_path
    if (x === 'R' || x === 'C') {
      i += 2 // new_path + old_path
    } else {
      i++
    }
  }

  return result
}

function resolveStatus(x: string, y: string): TreeEntryStatus {
  if (x === '?' && y === '?') {
    return 'untracked'
  }
  if (x === 'A' || y === 'A') {
    return 'added'
  }
  if (x === 'D' || y === 'D') {
    return 'deleted'
  }
  if (x === 'M' || y === 'M' || x === 'R' || x === 'C') {
    return 'modified'
  }
  return null
}
