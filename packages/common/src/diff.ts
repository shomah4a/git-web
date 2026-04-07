/**
 * diff 表示エンドポイントの DTO。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - front ↔ api の wire format のみを表現する
 * - api 内部のドメインモデルとは構造同型でも型定義は別にする
 * - controller がドメインモデルから object literal 変換でこの型に詰める
 */

export type DiffFileStatusDto = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'

export type DiffLineKindDto = 'context' | 'add' | 'delete'

export type DiffLineDto = {
  readonly kind: DiffLineKindDto
  readonly content: string
  readonly oldLineNo: number | null
  readonly newLineNo: number | null
}

export type DiffHunkDto = {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly header: string
  readonly lines: ReadonlyArray<DiffLineDto>
}

export type DiffFileSummaryDto = {
  readonly path: string
  readonly oldPath: string | null
  readonly status: DiffFileStatusDto
  readonly additions: number
  readonly deletions: number
  readonly binary: boolean
}

export type DiffFileDto = DiffFileSummaryDto & {
  readonly language: string | null
  readonly hunks: ReadonlyArray<DiffHunkDto>
}

/**
 * GET /api/diff/files のレスポンス DTO。
 */
export type DiffFilesResponseDto = {
  readonly files: ReadonlyArray<DiffFileSummaryDto>
}
