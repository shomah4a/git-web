/**
 * git CLI を子プロセスとして起動する GitClient / GitDiffClient 実装。
 *
 * 設計方針:
 * - ADR 0007 / 0009 に従い、シェル経由実行は行わない (`execFile` を使う)。
 *   引数は必ず配列で渡す
 * - 外部ライブラリ依存はここに閉じ込める (adapter 層の責務)
 * - diff 系は 2 コマンド方式 (--raw -z と --numstat -z を別々に実行)
 *   で path キーマージする (ADR 0012 / M7 対応)
 * - ADR 0018 に従い、revision 引数がフラグとして解釈されないよう
 *   必ず `--end-of-options` 以降に置く (git 2.24+ 前提)。
 *   これは parseRevision の入力検査に対する二層防御
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DiffFileSummary } from '../../domain/diff.js'
import type { DiffRange } from '../../domain/diff-range.js'
import type { GitClient } from '../../domain/ports/git-client.js'
import type { GitDiffClient } from '../../domain/ports/git-diff-client.js'
import type { GitRefsClient } from '../../domain/ports/git-refs-client.js'
import type { GitTreeClient } from '../../domain/ports/git-tree-client.js'
import type { Revision } from '../../domain/revision.js'
import type { TreeEntry } from '../../domain/tree.js'
import { parseNumstatZ, parseRawZ } from './diff-summary-parser.js'
import { extractOneLevel } from './ls-files-parser.js'
import { parseLsTreeZ } from './ls-tree-parser.js'
import { parseStatusZ } from './status-parser.js'

const execFileAsync = promisify(execFile)

/**
 * git diff 系コマンドの stdout バッファ上限。
 * 大規模リポジトリでも一般的な diff サイズを許容するため 50 MB に設定する。
 */
const DIFF_MAX_BUFFER = 50 * 1024 * 1024

/**
 * 子プロセスとして git CLI を起動する GitClient / GitDiffClient 実装。
 */
export class CliGitClient implements GitClient, GitDiffClient, GitRefsClient, GitTreeClient {
  readonly #cwd: string

  constructor(cwd: string) {
    this.#cwd = cwd
  }

  async head(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: this.#cwd })
    return stdout.trim()
  }

  async repoRoot(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: this.#cwd,
    })
    return stdout.trim()
  }

  async diffSummary(range: DiffRange): Promise<ReadonlyArray<DiffFileSummary>> {
    const rangeArgs = toGuardedRangeArgs(range)
    const [rawResult, numResult] = await Promise.all([
      execFileAsync('git', ['diff', '--raw', '-z', '-M', ...rangeArgs], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
      execFileAsync('git', ['diff', '--numstat', '-z', '-M', ...rangeArgs], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
    ])
    const rawEntries = parseRawZ(rawResult.stdout)
    const numEntries = parseNumstatZ(numResult.stdout)
    const numByPath = new Map(numEntries.map((entry) => [entry.path, entry]))

    const result: DiffFileSummary[] = []
    for (const raw of rawEntries) {
      const num = numByPath.get(raw.path)
      const additions = num?.additions ?? 0
      const deletions = num?.deletions ?? 0
      const binary = num !== undefined && num.additions === null && num.deletions === null
      result.push({
        path: raw.path,
        oldPath: raw.oldPath,
        status: raw.status,
        additions,
        deletions,
        binary,
      })
    }
    return result
  }

  async listBranches(): Promise<ReadonlyArray<string>> {
    return this.#listRefsBySpec('refs/heads')
  }

  async listTags(): Promise<ReadonlyArray<string>> {
    return this.#listRefsBySpec('refs/tags')
  }

  async #listRefsBySpec(refSpec: string): Promise<ReadonlyArray<string>> {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', refSpec],
      {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      },
    )
    if (stdout.length === 0) {
      return []
    }
    // ref 名に改行は入らない (git check-ref-format の制約)
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  async diffFile(range: DiffRange, path: string): Promise<string> {
    const rangeArgs = toGuardedRangeArgs(range)
    const { stdout } = await execFileAsync('git', ['diff', '-M', ...rangeArgs, '--', path], {
      cwd: this.#cwd,
      maxBuffer: DIFF_MAX_BUFFER,
    })
    return stdout
  }

  async listTree(rev: Revision, path: string): Promise<ReadonlyArray<TreeEntry>> {
    const args = path === '' ? [rev.raw] : [`${rev.raw}:${path}`]
    const { stdout } = await execFileAsync(
      'git',
      ['ls-tree', '-l', '-z', '--end-of-options', ...args],
      {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      },
    )
    return parseLsTreeZ(stdout, path)
  }

  /**
   * worktree の指定パス配下 1 階層分のエントリを返す。
   *
   * git ls-files で tracked + untracked (.gitignore 除外) を列挙し、
   * git status で各ファイルの状態を付与する。
   */
  async listWorktreeTree(path: string): Promise<ReadonlyArray<TreeEntry>> {
    const [lsResult, statusResult] = await Promise.all([
      execFileAsync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
      execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
    ])
    const statusMap = parseStatusZ(statusResult.stdout)
    return extractOneLevel(lsResult.stdout, path, statusMap)
  }
}

/**
 * DiffRange を git diff コマンドの範囲引数に変換する。
 *
 * ADR 0018 の二層防御方針に従い、revision 引数の前に必ず `--end-of-options`
 * を置く。これにより parseRevision のバリデーションが崩れても git 側で
 * フラグとして解釈されない。呼び出し側で `--end-of-options` を手書きしない
 * ことで、将来の diff 系コマンド追加時の付け忘れを構造的に防ぐ。
 *
 * - working-vs-head → ['--end-of-options', 'HEAD']      (git diff HEAD)
 * - working-vs-rev  → ['--end-of-options', from]        (git diff <from>)
 * - rev-vs-rev      → ['--end-of-options', from, to]    (git diff <from> <to>)
 */
function toGuardedRangeArgs(range: DiffRange): ReadonlyArray<string> {
  const revs =
    range.kind === 'working-vs-head'
      ? ['HEAD']
      : range.kind === 'working-vs-rev'
        ? [range.from.raw]
        : [range.from.raw, range.to.raw]
  return ['--end-of-options', ...revs]
}
