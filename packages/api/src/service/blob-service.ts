/**
 * blob 取得ユースケース層。
 *
 * 設計方針 (ADR 0011 / ADR 0016):
 * - BlobReader port を注入して委譲する。reader は language を埋めない
 *   (ADR 0016: reader の責務は副作用とファイル内容取得のみ)
 * - 本 service が path から inferLanguage で language を推定して Blob を
 *   再構築する
 * - reader が null を返したらそのまま null (controller で 404)
 * - HTTP / フレームワーク / DTO には依存しない
 */

import type { Blob } from '../domain/blob.js'
import { inferLanguage } from '../domain/language.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { Revision } from '../domain/revision.js'

export type BlobService = {
  getBlob(path: string, rev: Revision | null): Promise<Blob | null>
}

export function createBlobService(reader: BlobReader): BlobService {
  return {
    async getBlob(path, rev) {
      const blob = await reader.read(path, rev)
      if (blob === null) {
        return null
      }
      return {
        path: blob.path,
        rev: blob.rev,
        content: blob.content,
        binary: blob.binary,
        language: inferLanguage(blob.path),
      }
    },
  }
}
