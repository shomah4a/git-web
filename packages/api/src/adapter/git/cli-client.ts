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
import { parseNumstatZ, parseRawZ } from './diff-summary-parser.js'

const execFileAsync = promisify(execFile)

/**
 * git diff 系コマンドの stdout バッファ上限。
 * 大規模リポジトリでも一般的な diff サイズを許容するため 50 MB に設定する。
 */
const DIFF_MAX_BUFFER = 50 * 1024 * 1024

/**
 * 子プロセスとして git CLI を起動する GitClient / GitDiffClient 実装。
 */
export class CliGitClient implements GitClient, GitDiffClient {
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
    const rangeArgs = toRangeArgs(range)
    const [rawResult, numResult] = await Promise.all([
      execFileAsync('git', ['diff', '--raw', '-z', '-M', '--end-of-options', ...rangeArgs], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
      execFileAsync('git', ['diff', '--numstat', '-z', '-M', '--end-of-options', ...rangeArgs], {
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

  async diffFile(range: DiffRange, path: string): Promise<string> {
    const rangeArgs = toRangeArgs(range)
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '-M', '--end-of-options', ...rangeArgs, '--', path],
      {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      },
    )
    return stdout
  }
}

/**
 * DiffRange を git diff コマンドの範囲引数に変換する。
 *
 * - working-vs-head → ['HEAD'] (git diff HEAD)
 * - working-vs-rev → [from]    (git diff <from>)
 * - rev-vs-rev     → [from, to] (git diff <from> <to>)
 */
function toRangeArgs(range: DiffRange): ReadonlyArray<string> {
  if (range.kind === 'working-vs-head') {
    return ['HEAD']
  }
  if (range.kind === 'working-vs-rev') {
    return [range.from.raw]
  }
  return [range.from.raw, range.to.raw]
}
