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
export type HeadInfoDto = {
  readonly commitHash: string
  readonly branch: string | null
}

export type RepoInfoDto = {
  readonly name: string
  readonly cwd: string
  readonly head: HeadInfoDto
}

export type { CommitDto, CommitStatsDto, CommitsResponseDto } from './commits.js'

export type {
  DiffFileDto,
  DiffFileStatusDto,
  DiffFileSummaryDto,
  DiffFilesResponseDto,
  DiffHunkDto,
  DiffLineDto,
  DiffLineKindDto,
} from './diff.js'

export type { BlobDto } from './blob.js'

export type { RefListDto } from './refs.js'

export type { EntryBaseDto, EntryTypeDto } from './entry-base.js'

export type { TreeEntryDto, TreeEntryStatusDto, TreeEntryTypeDto, TreeResponseDto } from './tree.js'

export type {
  WorktreeEntryDto,
  WorktreeEntryStatusDto,
  WorktreeEntryTypeDto,
  WorktreeResponseDto,
} from './worktree.js'

export {
  IMAGE_EXTENSION_TO_MIME,
  inferImageContentType,
  isImageExtension,
} from './image-extension.js'
