/**
 * blob 取得ユースケース層 (ADR 0016 / ADR 0055)。
 *
 * 設計方針 (ADR 0011):
 * - BlobReader port は引数で渡される (controller が wt context bind 済みのもの)。
 * - reader が language を埋めないため、本 service が path から inferLanguage で
 *   language を推定して Blob を再構築する (ADR 0016)
 * - reader が null を返したらそのまま null (controller で 404)
 * - HTTP / フレームワーク / DTO には依存しない
 */

import type { Blob } from '../domain/blob.js'
import { inferLanguage } from '../domain/language.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { Revision } from '../domain/revision.js'

export type BlobService = {
  getBlob(reader: BlobReader, path: string, rev: Revision | null): Promise<Blob | null>
}

export function createBlobService(): BlobService {
  return {
    async getBlob(reader, path, rev) {
      const blob = await reader.read(path, rev)
      if (blob === null) {
        return null
      }
      return {
        path: blob.path,
        rev: blob.rev,
        content: blob.content,
        binary: blob.binary,
        language: inferLanguage(
          blob.path,
          blob.binary ? undefined : blob.content.split('\n', 1)[0],
        ),
      }
    },
  }
}
