/**
 * ツリー表示の DTO (ADR 0022)。
 */

/**
 * ツリーエントリの種別。
 */
export type TreeEntryTypeDto = 'blob' | 'tree'

/**
 * ツリーエントリ 1 件の DTO。
 */
export type TreeEntryDto = {
  readonly name: string
  readonly path: string
  readonly type: TreeEntryTypeDto
}

/**
 * /api/tree レスポンス DTO。
 */
export type TreeResponseDto = {
  readonly entries: ReadonlyArray<TreeEntryDto>
}
