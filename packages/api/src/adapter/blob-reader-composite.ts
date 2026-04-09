/**
 * rev の有無で worktree / cat-file の BlobReader を dispatch する composite。
 *
 * 設計方針 (ADR 0016):
 * - rev === null の場合は worktree-blob-reader
 * - rev !== null の場合は cat-file-blob-reader
 * - BlobReader の実装はこの 2 種以外に増える予定がない想定なので 2 つ
 *   固定引数とする。将来増えたら配列 + ルーティング関数に変える
 */

import type { Blob } from '../domain/blob.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { Revision } from '../domain/revision.js'

export function createCompositeBlobReader(worktree: BlobReader, catFile: BlobReader): BlobReader {
  return {
    read(path: string, rev: Revision | null): Promise<Blob | null> {
      if (rev === null) {
        return worktree.read(path, rev)
      }
      return catFile.read(path, rev)
    },
  }
}
