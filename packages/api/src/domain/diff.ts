/**
 * diff 表示のためのドメインモデル型。
 *
 * 設計方針 (ADR 0012):
 * - 型のみ、振る舞いは持たない (必要になったら関数を追加する)
 * - DiffFileSummary は /api/diff/files エンドポイントが返す情報
 * - DiffFile は /api/diff/file エンドポイントが返す詳細 (hunks を含む)
 * - DiffFile は DiffFileSummary を継承し language と hunks を加える
 * - 初版では rename を modified に丸めるため status に 'renamed' / 'copied' が
 *   入ることはないが、型としては定義しておく
 * - DiffLine の content はマーカー (+/-/ ) を除外した純粋なソース行
 */

export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'

export type DiffFileSummary = {
  readonly path: string
  /**
   * rename / copy 元の path。初版では常に null。
   */
  readonly oldPath: string | null
  readonly status: DiffFileStatus
  readonly additions: number
  readonly deletions: number
  readonly binary: boolean
}

export type DiffLineKind = 'context' | 'add' | 'delete'

export type DiffLine = {
  readonly kind: DiffLineKind
  /**
   * マーカー (先頭の "+", "-", " ") を除外した純粋なソース行。
   * "\ No newline at end of file" はドメインには含めない (adapter 層で除外)。
   */
  readonly content: string
  /**
   * 削除/コンテキスト行における旧側の行番号。追加行では null。
   */
  readonly oldLineNo: number | null
  /**
   * 追加/コンテキスト行における新側の行番号。削除行では null。
   */
  readonly newLineNo: number | null
}

export type DiffHunk = {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  /**
   * hunk ヘッダ行の "@@ -a,b +c,d @@" 以降の右側部分 (関数名等)。
   * jsdiff は通常これを空文字列として返す。
   */
  readonly header: string
  readonly lines: ReadonlyArray<DiffLine>
}

export type DiffFile = DiffFileSummary & {
  /**
   * Shiki 互換の言語識別子。拡張子から推定、未知なら null。
   */
  readonly language: string | null
  readonly hunks: ReadonlyArray<DiffHunk>
}
