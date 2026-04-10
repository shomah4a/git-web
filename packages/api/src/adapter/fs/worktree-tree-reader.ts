/**
 * worktree (作業ツリー) のディレクトリ一覧を読み取る (ADR 0022)。
 *
 * 設計方針:
 * - rev === null (worktree) の場合にサービス層から呼ばれる
 * - parseDiffPath で形式検証後、repoRoot 基準で絶対パス化
 * - realpath + isInsideRepo で repo 境界検査
 * - .git ディレクトリはエントリから除外する
 * - FsLike は blob-reader と同様にテスト容易性のための private 型
 */

import { resolve } from 'node:path'
import { parseDiffPath } from '../../domain/diff-path.js'
import { InvalidDiffPathError } from '../../domain/errors.js'
import type { TreeEntry } from '../../domain/tree.js'
import { isInsideRepo } from './is-inside-repo.js'

/**
 * 本 adapter が依存する fs の最小サブセット。
 */
export type FsLike = {
  realpath(path: string): Promise<string>
  readdir(path: string, options: { withFileTypes: true }): Promise<ReadonlyArray<Dirent>>
}

/**
 * node:fs の Dirent の最小サブセット。
 */
export type Dirent = {
  readonly name: string
  isFile(): boolean
  isDirectory(): boolean
}

function isNotFoundError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false
  }
  if (!('code' in err)) {
    return false
  }
  const { code } = err
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export type WorktreeTreeReader = {
  list(path: string): Promise<ReadonlyArray<TreeEntry>>
}

export function createWorktreeTreeReader(repoRoot: string, fs: FsLike): WorktreeTreeReader {
  return {
    async list(path: string): Promise<ReadonlyArray<TreeEntry>> {
      // ルートの場合は parseDiffPath を通さない (空文字列は拒否されるため)
      if (path !== '') {
        parseDiffPath(path)
      }

      const absolute = path === '' ? repoRoot : resolve(repoRoot, path)

      // realpath 解決 + 境界検査
      const rootReal = await fs.realpath(repoRoot)
      let targetReal: string
      try {
        targetReal = await fs.realpath(absolute)
      } catch (err) {
        if (isNotFoundError(err)) {
          return []
        }
        throw err
      }

      if (path !== '' && !isInsideRepo(rootReal, targetReal)) {
        throw new InvalidDiffPathError(path, 'resolves outside repository root')
      }

      let dirents: ReadonlyArray<Dirent>
      try {
        dirents = await fs.readdir(targetReal, { withFileTypes: true })
      } catch (err) {
        if (isNotFoundError(err)) {
          return []
        }
        throw err
      }

      const entries: TreeEntry[] = []
      for (const dirent of dirents) {
        // .git ディレクトリは除外
        if (dirent.name === '.git') {
          continue
        }
        if (dirent.isDirectory()) {
          entries.push({
            name: dirent.name,
            path: path === '' ? dirent.name : `${path}/${dirent.name}`,
            type: 'tree',
          })
        } else if (dirent.isFile()) {
          entries.push({
            name: dirent.name,
            path: path === '' ? dirent.name : `${path}/${dirent.name}`,
            type: 'blob',
          })
        }
        // symlink 等の非ファイル・非ディレクトリは無視
      }

      return entries
    },
  }
}
