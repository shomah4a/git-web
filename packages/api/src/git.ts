/**
 * git CLI を高レベルメソッドで提供するクライアント。
 *
 * 設計方針:
 * - 利用側は GitClient インターフェースに依存し、git の引数や CLI の
 *   存在を意識しない
 * - 実装は CliGitClient（execFile で git CLI を叩く）を提供する
 * - テストでは GitClient をオブジェクトリテラルでフェイクして良い
 * - ADR 0007 / 0009 に従い、シェル経由実行は行わない (`execFile` を使う)。
 *   引数は必ず配列で渡す
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * git の高レベル操作を提供するインターフェース。
 *
 * 必要な操作が増えるたびにメソッドを追加していく。
 * 利用側は本インターフェースに依存し、CLI 引数などの詳細は知らない。
 */
export interface GitClient {
  /**
   * HEAD が指すコミットの SHA-1 ハッシュを返す。
   */
  head(): Promise<string>

  /**
   * リポジトリのトップレベル絶対パスを返す。
   * cwd がリポジトリ内でない場合は例外を投げる。
   */
  repoRoot(): Promise<string>
}

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
