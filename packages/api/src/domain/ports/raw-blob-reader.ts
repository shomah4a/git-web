/**
 * blob のバイナリ内容をそのまま返す port (ADR 0028)。
 *
 * 既存の BlobReader は content を string に変換するが、
 * /api/blob/raw はバイナリを Content-Type 付きで返す必要があるため
 * Buffer をそのまま返す専用ポートを用意する。
 */

import type { Revision } from '../revision.js'

export type RawBlobResult = {
  readonly buffer: Buffer
}

export interface RawBlobReader {
  read(path: string, rev: Revision | null): Promise<RawBlobResult | null>
}
