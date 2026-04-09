/**
 * `git cat-file blob <rev>:<path>` を呼ぶ BlobReader 実装。
 *
 * 設計方針 (ADR 0009 §3 / ADR 0016):
 * - rev !== null で呼ばれる。rev === null は worktree-blob-reader が担当する
 * - `git show` ではなく `git cat-file blob` を使う理由: `git show HEAD:<dir>`
 *   は tree listing を 200 で返してしまう事故があるため。`cat-file blob` は
 *   blob 以外 (tree / commit / tag) を拒否して非ゼロ終了する
 * - execFile には env に LC_ALL=C / LANG=C を必ず渡す (エラーメッセージの
 *   ローカライズ揺れ防止)
 * - maxBuffer は DIFF_MAX_BUFFER と同値の 50MB を指定する
 * - execFileFn を引数で受け取って DI 可能にし、テストでは fake を注入する
 * - 非存在 / 非 blob object は null を返す (controller で 404)
 *   - 判定条件: exit code === 128 かつ stderr が `fatal: ` で始まる
 * - binary 判定は NUL バイトの存在で行う
 */

import type { Blob } from '../../domain/blob.js'
import type { BlobReader } from '../../domain/ports/blob-reader.js'
import type { Revision } from '../../domain/revision.js'

/**
 * execFile をこの adapter が使う最小シグネチャに絞った型。
 * production では promisify(execFile) 相当を渡す。
 */
export type ExecFileFn = (
  file: string,
  args: ReadonlyArray<string>,
  options: {
    readonly env?: NodeJS.ProcessEnv
    readonly maxBuffer?: number
    readonly encoding?: 'buffer'
  },
) => Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }>

const CAT_FILE_MAX_BUFFER = 50 * 1024 * 1024

const GIT_ENV = {
  LC_ALL: 'C',
  LANG: 'C',
} as const

function isBlobNotFoundError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false
  }
  if (!('code' in err) || err.code !== 128) {
    return false
  }
  if (!('stderr' in err)) {
    return false
  }
  const { stderr } = err
  let stderrText: string
  if (typeof stderr === 'string') {
    stderrText = stderr
  } else if (stderr instanceof Buffer) {
    stderrText = stderr.toString('utf8')
  } else {
    return false
  }
  return stderrText.startsWith('fatal: ')
}

function containsNulByte(buf: Buffer): boolean {
  return buf.includes(0)
}

export function createCatFileBlobReader(execFileFn: ExecFileFn, repoRoot: string): BlobReader {
  return {
    async read(path: string, rev: Revision | null): Promise<Blob | null> {
      if (rev === null) {
        throw new Error('cat-file-blob-reader called with null rev')
      }

      const spec = `${rev.raw}:${path}`
      let stdout: Buffer
      try {
        const result = await execFileFn('git', ['-C', repoRoot, 'cat-file', 'blob', spec], {
          env: { ...process.env, ...GIT_ENV },
          maxBuffer: CAT_FILE_MAX_BUFFER,
          encoding: 'buffer',
        })
        stdout = result.stdout
      } catch (err) {
        if (isBlobNotFoundError(err)) {
          return null
        }
        throw err
      }

      const binary = containsNulByte(stdout)
      const content = binary ? '' : stdout.toString('utf8')

      return {
        path,
        rev,
        content,
        binary,
        language: null,
      }
    },
  }
}
