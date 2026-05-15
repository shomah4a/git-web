/**
 * `git worktree list --porcelain` を実行する adapter (ADR 0055)。
 *
 * 設計方針:
 * - 副作用 (execFile) は注入式。CliGitClient 等と同じ流儀で testable に保つ
 * - locale 非依存にするため `LC_ALL=C` / `LANG=C` を固定して呼び出す
 *   (porcelain は元々 locale-independent だが、defense in depth で固定する)
 */

import type { GitWorktreeListClient } from '../../domain/ports/git-worktree-list-client.js'
import type { WorktreeInfo } from '../../domain/worktree-info.js'
import { parseWorktreeListPorcelain } from './worktree-list-parser.js'

/**
 * `execFile` 相当の関数型。
 * stdout / stderr ともに UTF-8 string で返す。
 */
export type WorktreeListExecFn = (
  file: string,
  args: ReadonlyArray<string>,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>

export class WorktreeListClient implements GitWorktreeListClient {
  readonly #cwd: string
  readonly #execFile: WorktreeListExecFn

  constructor(cwd: string, execFileFn: WorktreeListExecFn) {
    this.#cwd = cwd
    this.#execFile = execFileFn
  }

  async listWorktrees(): Promise<ReadonlyArray<WorktreeInfo>> {
    const { stdout } = await this.#execFile('git', ['worktree', 'list', '--porcelain'], {
      cwd: this.#cwd,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    })
    return parseWorktreeListPorcelain(stdout)
  }
}
