/**
 * `git worktree list --porcelain` の出力パーサ (ADR 0055)。
 *
 * 出力フォーマット (git 2.7+):
 * - 各 worktree セクションは空行区切り
 * - セクション内の各行はラベル + 値の形式
 *   - `worktree <absolute_path>` (必須、先頭)
 *   - `HEAD <40-hex>` (空 worktree では省略されうる)
 *   - `branch <refname>` (例: `refs/heads/main`)
 *   - `detached` (detached HEAD のときに出る)
 *   - `bare` (bare repository のとき)
 *   - `locked [<reason>]` / `prunable [<reason>]` (任意)
 *
 * 設計方針:
 * - 純粋関数として実装。execFile 等の副作用は含まない (ADR 0011)
 * - 未知ラベルは握りつぶし。`worktree` 行を持たないセクションは捨てる (allowlist 方式)
 */

import type { WorktreeInfo } from '../../domain/worktree-info.js'

export function parseWorktreeListPorcelain(stdout: string): ReadonlyArray<WorktreeInfo> {
  if (stdout.length === 0) {
    return []
  }

  const sections = splitSections(stdout)
  const result: WorktreeInfo[] = []
  for (const section of sections) {
    const info = parseSection(section)
    if (info !== null) {
      result.push(info)
    }
  }
  return result
}

function splitSections(stdout: string): ReadonlyArray<ReadonlyArray<string>> {
  // 改行を統一して空行で分割する。末尾の空セクションは捨てる。
  const lines = stdout.split('\n')
  const sections: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) {
    sections.push(current)
  }
  return sections
}

function parseSection(lines: ReadonlyArray<string>): WorktreeInfo | null {
  let path: string | null = null
  let headHash: string | null = null
  let branchRef: string | null = null
  let isDetached = false
  let isBare = false
  let isLocked = false
  let isPrunable = false

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length)
      continue
    }
    if (line.startsWith('HEAD ')) {
      headHash = line.slice('HEAD '.length)
      continue
    }
    if (line.startsWith('branch ')) {
      branchRef = line.slice('branch '.length)
      continue
    }
    if (line === 'detached') {
      isDetached = true
      continue
    }
    if (line === 'bare') {
      isBare = true
      continue
    }
    if (line === 'locked' || line.startsWith('locked ')) {
      isLocked = true
      continue
    }
    if (line === 'prunable' || line.startsWith('prunable ')) {
      isPrunable = true
      continue
    }
    // 未知のラベル: 握りつぶす (将来の git バージョンで追加されたラベルへの conservative 対応)
  }

  if (path === null || path === '') {
    return null
  }

  return {
    path,
    headHash,
    branchRef,
    isDetached,
    isBare,
    isLocked,
    isPrunable,
  }
}
