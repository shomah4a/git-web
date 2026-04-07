/**
 * git CLI を子プロセスとして起動する GitClient 実装。
 *
 * 設計方針:
 * - ADR 0007 / 0009 に従い、シェル経由実行は行わない (`execFile` を使う)。
 *   引数は必ず配列で渡す
 * - 外部ライブラリ依存はここに閉じ込める (adapter 層の責務)
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitClient } from '../../domain/ports/git-client.js'

const execFileAsync = promisify(execFile)

/**
 * 子プロセスとして git CLI を起動する GitClient 実装。
 */
export class CliGitClient implements GitClient {
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
}
