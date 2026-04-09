/**
 * blob (ファイル内容) 取得エンドポイントの DTO。
 *
 * 設計方針 (ADR 0016):
 * - GET /api/blob?path=<path>&rev=<rev> のレスポンス型
 * - rev キーが省略された場合は worktree のファイルを指し、rev は null になる
 * - binary ファイルは content: '' で返り、binary: true でマークする
 * - language は path からの推定結果 (既存 inferLanguage ベース)
 */
export type BlobDto = {
  readonly path: string
  readonly rev: string | null
  readonly content: string
  readonly binary: boolean
  readonly language: string | null
}
