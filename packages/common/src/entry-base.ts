/**
 * ツリーエントリ DTO の共通ベース型 (ADR 0026)。
 *
 * TreeEntryDto と WorktreeEntryDto の共通フィールドを定義する。
 */

/**
 * エントリの種別。
 */
export type EntryTypeDto = 'blob' | 'tree'

/**
 * ツリーエントリの共通フィールド。
 */
export type EntryBaseDto = {
  readonly name: string
  readonly path: string
  readonly type: EntryTypeDto
  readonly mode: string | null
  readonly size: number | null
}
