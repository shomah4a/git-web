/**
 * RawBlobReader の composite 実装 (ADR 0028)。
 *
 * rev が null なら worktree (ファイルシステム)、非 null なら git cat-file で
 * Buffer を取得する。worktree モードでは realpath + isInsideRepo による
 * リポジトリ境界検査を行い、シンボリックリンク経由の repo 外読み取りを防止する。
 */

import { resolve } from 'node:path'
import { InvalidDiffPathError } from '../domain/errors.js'
import type { RawBlobReader, RawBlobResult } from '../domain/ports/raw-blob-reader.js'
import type { Revision } from '../domain/revision.js'
import { isInsideRepo } from './fs/is-inside-repo.js'

export type RealpathFn = (path: string) => Promise<string>
export type ReadFileFn = (path: string) => Promise<Buffer>

export type ExecGitCatFileFn = (rev: Revision, path: string) => Promise<Buffer | null>

function isNotFoundError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false
  if (!('code' in err)) return false
  const { code } = err
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function createRawBlobReader(
  repoRoot: string,
  realpathFn: RealpathFn,
  readFileFn: ReadFileFn,
  execGitCatFileFn: ExecGitCatFileFn,
): RawBlobReader {
  return {
    async read(path: string, rev: Revision | null): Promise<RawBlobResult | null> {
      if (rev === null) {
        const absolute = resolve(repoRoot, path)
        const rootReal = await realpathFn(repoRoot)
        let targetReal: string
        try {
          targetReal = await realpathFn(absolute)
        } catch (err) {
          if (isNotFoundError(err)) return null
          throw err
        }
        if (!isInsideRepo(rootReal, targetReal)) {
          throw new InvalidDiffPathError(path, 'resolves outside repository root')
        }
        try {
          const buffer = await readFileFn(targetReal)
          return { buffer }
        } catch (err) {
          if (isNotFoundError(err)) return null
          throw err
        }
      }
      const buffer = await execGitCatFileFn(rev, path)
      if (buffer === null) return null
      return { buffer }
    },
  }
}
