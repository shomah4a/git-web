/**
 * worktree (作業ツリー) の blob を読み取る BlobReader 実装。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0016):
 * - rev === null で呼ばれる。rev 付きは cat-file-blob-reader が担当する
 * - parseDiffPath で形式検証したあと、repoRoot 基準で絶対パス化し
 *   realpath を解決する
 * - isInsideRepo で repo 境界検査を行う (シンボリックリンクで repo 外を
 *   指すパスを弾く)
 * - TOCTOU (realpath と readFile の間の差し替え) は許容する。前提は
 *   「repo root 内は信頼されたファイル」
 * - 存在しないファイルは null を返す (controller 側で 404)
 * - binary 判定は NUL バイトの存在で行う。binary 時は content は空文字
 * - language は本 adapter では埋めず、上位の service 層で付与する
 *
 * FsLike は本 adapter のテスト容易性のための private 型。port として
 * domain/ports/ には公開しない。
 */

import { resolve } from 'node:path'
import type { Blob } from '../../domain/blob.js'
import { parseDiffPath } from '../../domain/diff-path.js'
import { InvalidDiffPathError } from '../../domain/errors.js'
import type { BlobReader } from '../../domain/ports/blob-reader.js'
import type { Revision } from '../../domain/revision.js'
import { isInsideRepo } from './is-inside-repo.js'

/**
 * 本 adapter が依存する fs の最小サブセット。
 * production では node:fs/promises の `fs.realpath` / `fs.readFile` を渡す。
 * テストでは fake を渡す。
 */
export type FsLike = {
  realpath(path: string): Promise<string>
  readFile(path: string): Promise<Buffer>
}

/**
 * ENOENT など「ファイル未存在」系のエラーコードを持つ Node のエラー判定。
 */
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

function containsNulByte(buf: Buffer): boolean {
  return buf.includes(0)
}

export function createWorktreeBlobReader(repoRoot: string, fs: FsLike): BlobReader {
  return {
    async read(path: string, rev: Revision | null): Promise<Blob | null> {
      if (rev !== null) {
        throw new Error('worktree-blob-reader called with non-null rev')
      }

      // 1. 形式チェック (`..` segment / 絶対パス / 制御文字 等)
      const safePath = parseDiffPath(path)

      // 2. repo 基準で絶対パス化
      const absolute = resolve(repoRoot, safePath)

      // 3. realpath 解決 + 境界検査
      // repoRoot の realpath 失敗は構成エラーなので catch しない
      const rootReal = await fs.realpath(repoRoot)
      let targetReal: string
      try {
        targetReal = await fs.realpath(absolute)
      } catch (err) {
        if (isNotFoundError(err)) {
          return null
        }
        throw err
      }
      if (!isInsideRepo(rootReal, targetReal)) {
        throw new InvalidDiffPathError(path, 'resolves outside repository root')
      }

      // 4. 実ファイル読み取り
      let buffer: Buffer
      try {
        buffer = await fs.readFile(targetReal)
      } catch (err) {
        if (isNotFoundError(err)) {
          return null
        }
        throw err
      }

      const binary = containsNulByte(buffer)
      const content = binary ? '' : buffer.toString('utf8')

      return {
        path: safePath,
        rev: null,
        content,
        binary,
        language: null,
      }
    },
  }
}
