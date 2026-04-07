/**
 * 対象 git リポジトリの基本情報の DTO。
 *
 * - cwd: git-web を起動したときの作業ディレクトリ（絶対パス）
 * - head: HEAD が指すコミットの SHA-1 ハッシュ
 *
 * 設計方針: ADR 0011 に従い、common パッケージには front ↔ api の
 * wire format (DTO) のみを置く。api 内部のドメインモデルは
 * packages/api/src/domain/ 配下に別定義する。
 */
export type RepoInfoDto = {
  readonly cwd: string
  readonly head: string
}

export type {
  DiffFileDto,
  DiffFileStatusDto,
  DiffFileSummaryDto,
  DiffFilesResponseDto,
  DiffHunkDto,
  DiffLineDto,
  DiffLineKindDto,
} from './diff.js'
