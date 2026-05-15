/**
 * BoundedWorktreePath を受け取り、その worktree に bind した各種 client を組み立てる
 * factory (ADR 0055 §2, §7-3)。
 *
 * 設計方針:
 * - 文字列 path は受け取らない。BoundedWorktreePath のみが入力。これにより
 *   resolver を経由していない未検証 path で client を組む経路を型レベルで遮断する
 * - 副作用 (fs.stat / fs.realpath / fs.readFile / child_process.execFile) は
 *   コンストラクション時に注入する
 * - 都度新しい client インスタンスを生成する。client は軽量 (引数を保持するだけ)
 *   なので、リクエストごとの生成コストは無視できる
 */

import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { GitClient } from '../domain/ports/git-client.js'
import type { GitTreeClient } from '../domain/ports/git-tree-client.js'
import type { GitTreeCommitsClient } from '../domain/ports/git-tree-commits-client.js'
import type { GitWorktreeClient } from '../domain/ports/git-worktree-client.js'
import type { RawBlobReader } from '../domain/ports/raw-blob-reader.js'
import type { Revision } from '../domain/revision.js'
import type { WorktreeTreeLister } from '../service/tree-service.js'
import { createCompositeBlobReader } from '../adapter/blob-reader-composite.js'
import { createCatFileBlobReader, type ExecFileFn } from '../adapter/git/cat-file-blob-reader.js'
import { CliGitClient } from '../adapter/git/cli-client.js'
import { WorktreeLister, type FileStat } from '../adapter/git/worktree-lister.js'
import { createWorktreeBlobReader } from '../adapter/fs/worktree-blob-reader.js'
import { createRawBlobReader } from '../adapter/raw-blob-reader-composite.js'
import type { BoundedWorktreePath } from './worktree-path.js'

export type WorktreeClients = {
  readonly path: BoundedWorktreePath
  readonly gitClient: GitClient
  readonly gitTreeClient: GitTreeClient
  readonly worktreeTreeLister: WorktreeTreeLister
  readonly worktreeLister: GitWorktreeClient
  readonly treeCommitsClient: GitTreeCommitsClient
  readonly worktreeBlobReader: BlobReader
  readonly rawBlobReader: RawBlobReader
}

export type WorktreeClientsFactoryDeps = {
  readonly stat: FileStat
  readonly realpath: (path: string) => Promise<string>
  readonly readFile: (path: string) => Promise<Buffer>
  readonly execFile: ExecFileFn
}

export type WorktreeClientsFactory = (bounded: BoundedWorktreePath) => WorktreeClients

export function createWorktreeClientsFactory(
  deps: WorktreeClientsFactoryDeps,
): WorktreeClientsFactory {
  return (bounded: BoundedWorktreePath): WorktreeClients => {
    const worktreePath = bounded.absolutePath
    const worktreeLister = new WorktreeLister(worktreePath, deps.stat)
    const gitClient = new CliGitClient(worktreePath)
    const worktreeFsReader = createWorktreeBlobReader(worktreePath, {
      realpath: deps.realpath,
      readFile: deps.readFile,
    })
    const catFileReader = createCatFileBlobReader(deps.execFile, worktreePath)
    const worktreeBlobReader = createCompositeBlobReader(worktreeFsReader, catFileReader)

    const rawBlobReader = createRawBlobReader(
      worktreePath,
      deps.realpath,
      deps.readFile,
      buildRawCatFile(worktreePath, deps.execFile),
    )

    return {
      path: bounded,
      gitClient,
      gitTreeClient: gitClient,
      worktreeTreeLister: gitClient,
      worktreeLister,
      treeCommitsClient: gitClient,
      worktreeBlobReader,
      rawBlobReader,
    }
  }
}

const GIT_ENV = { LC_ALL: 'C', LANG: 'C' } as const
const CAT_FILE_MAX_BUFFER = 50 * 1024 * 1024

function buildRawCatFile(
  worktreePath: string,
  execFile: ExecFileFn,
): (rev: Revision, path: string) => Promise<Buffer | null> {
  return async (rev: Revision, path: string): Promise<Buffer | null> => {
    const spec = `${rev.raw}:${path}`
    try {
      const result = await execFile('git', ['-C', worktreePath, 'cat-file', 'blob', spec], {
        env: { ...process.env, ...GIT_ENV },
        maxBuffer: CAT_FILE_MAX_BUFFER,
        encoding: 'buffer',
      })
      return result.stdout
    } catch (err) {
      if (err !== null && typeof err === 'object' && 'code' in err && err.code === 128) {
        return null
      }
      throw err
    }
  }
}
