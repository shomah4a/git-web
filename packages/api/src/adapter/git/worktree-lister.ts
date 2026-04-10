/**
 * worktree エントリ取得の adapter 実装 (ADR 0023)。
 *
 * git ls-files + git ls-files --stage + git status + fs.stat を組み合わせて
 * mode / size / status 付きの WorktreeEntry を返す。
 *
 * fs.stat は副作用のため、コンストラクタで注入する (ADR 0023 / コーディング規約)。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitWorktreeClient } from '../../domain/ports/git-worktree-client.js'
import type { WorktreeEntry, WorktreeEntryStatus } from '../../domain/worktree-entry.js'
import { parseLsFilesStageZ } from './ls-files-stage-parser.js'
import { extractWorktreeOneLevel } from './worktree-entry-parser.js'

const execFileAsync = promisify(execFile)

const MAX_BUFFER = 50 * 1024 * 1024

/**
 * ファイルサイズ取得の副作用を抽象化する型。
 * fs.stat 相当の関数を注入する。
 */
export type FileStat = (path: string) => Promise<{ size: number }>

/**
 * git status --porcelain=v1 -z の出力をパースする。
 * status-parser.ts の parseStatusZ と同等だが WorktreeEntryStatus を返す。
 */
function parseWorktreeStatusZ(stdout: string): ReadonlyMap<string, WorktreeEntryStatus> {
  if (stdout.length === 0) {
    return new Map()
  }

  const result = new Map<string, WorktreeEntryStatus>()
  const parts = stdout.split('\0')

  let i = 0
  while (i < parts.length) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) {
      i++
      continue
    }

    const x = entry.charAt(0)
    const y = entry.charAt(1)
    const path = entry.slice(3)
    const status = resolveStatus(x, y)

    if (status !== null && path.length > 0) {
      result.set(path, status)
    }

    if (x === 'R' || x === 'C') {
      i += 2
    } else {
      i++
    }
  }

  return result
}

function resolveStatus(x: string, y: string): WorktreeEntryStatus {
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

export class WorktreeLister implements GitWorktreeClient {
  readonly #cwd: string
  readonly #stat: FileStat

  constructor(cwd: string, stat: FileStat) {
    this.#cwd = cwd
    this.#stat = stat
  }

  async listWorktreeEntries(path: string): Promise<ReadonlyArray<WorktreeEntry>> {
    const [lsResult, stageResult, statusResult] = await Promise.all([
      execFileAsync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: this.#cwd,
        maxBuffer: MAX_BUFFER,
      }),
      execFileAsync('git', ['ls-files', '--stage', '-z'], {
        cwd: this.#cwd,
        maxBuffer: MAX_BUFFER,
      }),
      execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
        cwd: this.#cwd,
        maxBuffer: MAX_BUFFER,
      }),
    ])

    const statusMap = parseWorktreeStatusZ(statusResult.stdout)
    const modeMap = parseLsFilesStageZ(stageResult.stdout)

    // 1 階層分のエントリを先に抽出し、blob のみ size を取得する
    const tempEntries = extractWorktreeOneLevel(
      lsResult.stdout,
      path,
      statusMap,
      modeMap,
      new Map(),
    )

    // blob エントリの size を fs.stat で取得
    const sizeMap = new Map<string, number>()
    const sizePromises: Promise<void>[] = []
    for (const entry of tempEntries) {
      if (entry.type === 'blob' && entry.status !== 'deleted') {
        const filePath = `${this.#cwd}/${entry.path}`
        sizePromises.push(
          this.#stat(filePath)
            .then((s) => {
              sizeMap.set(entry.path, s.size)
            })
            .catch(() => {
              // stat 失敗 (deleted 等) は size: null のまま
            }),
        )
      }
    }
    await Promise.all(sizePromises)

    // size を反映した最終エントリを構築
    return tempEntries.map((entry) => {
      const size = sizeMap.get(entry.path) ?? null
      if (size === entry.size) {
        return entry
      }
      return { ...entry, size }
    })
  }
}
