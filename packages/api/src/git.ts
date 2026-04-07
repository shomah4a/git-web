/**
 * git CLI ラッパ。
 *
 * 設計方針:
 * - git の実行は GitRunner というインターフェース経由で行い、
 *   テスト時はモックを注入できるようにする（副作用の外部化）
 * - ADR 0007 / 0009 に従い、シェル経由実行は行わない (`execFile` を使う)
 * - 引数は必ず配列で渡し、ユーザー入力を文字列連結で組み立てない
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type GitResult = {
  readonly stdout: string
  readonly stderr: string
}

/**
 * git コマンドを実行する関数の型。
 * テストでは fake / mock 実装を渡してこの境界を切る。
 */
export type GitRunner = (args: ReadonlyArray<string>, cwd: string) => Promise<GitResult>

/**
 * 実際に子プロセスとして git を起動するデフォルト実装。
 * 本番コードではこれを使う。
 */
export const realGitRunner: GitRunner = async (args, cwd) => {
  const { stdout, stderr } = await execFileAsync('git', [...args], { cwd })
  return { stdout, stderr }
}

/**
 * HEAD の SHA-1 ハッシュを返す。
 */
export async function getHead(runner: GitRunner, cwd: string): Promise<string> {
  const { stdout } = await runner(['rev-parse', 'HEAD'], cwd)
  return stdout.trim()
}

/**
 * リポジトリのトップレベル絶対パスを返す。
 * cwd がリポジトリ内でない場合は git 自体がエラーを返すため例外として伝播する。
 */
export async function getRepoRoot(runner: GitRunner, cwd: string): Promise<string> {
  const { stdout } = await runner(['rev-parse', '--show-toplevel'], cwd)
  return stdout.trim()
}
