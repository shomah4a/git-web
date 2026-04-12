/**
 * diff 表示のユースケース層。
 *
 * 設計方針 (ADR 0011 / ADR 0012 / ADR 0030):
 * - 引数は domain 型 (DiffRange など)、戻り値もドメインモデル
 * - 外部依存は GitDiffClient port / DiffParser port / BlobReader port を注入する
 * - BlobReader は shebang ベース言語判定のためにファイル先頭行を取得する用途
 * - HTTP / フレームワーク / DTO には依存しない
 */

import type { DiffFile, DiffFileStatus, DiffFileSummary } from '../domain/diff.js'
import type { DiffRange } from '../domain/diff-range.js'
import { inferLanguage } from '../domain/language.js'
import type { BlobReader } from '../domain/ports/blob-reader.js'
import type { GitDiffClient } from '../domain/ports/git-diff-client.js'
import type { DiffParser, ParsedDiffFile } from '../domain/ports/diff-parser.js'
import type { Revision } from '../domain/revision.js'

export type DiffService = {
  /**
   * 指定範囲のファイル一覧を返す。変更なしなら空配列。
   */
  getDiffFileList(range: DiffRange): Promise<ReadonlyArray<DiffFileSummary>>

  /**
   * 指定範囲の個別ファイルの詳細 diff を返す。
   *
   * 以下のいずれかの場合は null を返す (controller で 404 にマップ):
   * - 対象ファイルが存在しない / 変更がない (patch が空)
   * - rename only / binary のような unified diff として表示できない変更
   */
  getDiffFile(range: DiffRange, path: string): Promise<DiffFile | null>
}

export function createDiffService(
  git: GitDiffClient,
  parser: DiffParser,
  blobReader: BlobReader,
): DiffService {
  return {
    getDiffFileList: (range) => git.diffSummary(range),

    async getDiffFile(range, path) {
      const patch = await git.diffFile(range, path)
      if (patch === '') {
        return null
      }
      const parsed = parser(patch)
      const first = parsed[0]
      if (first === undefined) {
        // binary / rename only 等、jsdiff が解釈できなかったケース
        return null
      }
      const filePath = first.newPath ?? first.oldPath ?? path
      const firstLine = await readFirstLine(blobReader, filePath, range)
      return toDiffFile(first, path, firstLine)
    },
  }
}

/**
 * DiffRange の "new 側" リビジョンでファイル先頭行を読み取る。
 *
 * - working-vs-head / working-vs-rev → working tree (rev=null)
 * - rev-vs-rev → to リビジョン
 *
 * blob が取得できない場合（削除ファイル等）は null を返す。
 */
async function readFirstLine(
  reader: BlobReader,
  path: string,
  range: DiffRange,
): Promise<string | null> {
  const rev: Revision | null = range.kind === 'rev-vs-rev' ? range.to : null
  const blob = await reader.read(path, rev)
  if (blob === null || blob.binary) {
    return null
  }
  return blob.content.split('\n', 1)[0] ?? null
}

/**
 * ParsedDiffFile (adapter からの中間表現) を DiffFile (ドメインモデル) に
 * 組み立てる。
 *
 * - additions / deletions は hunks 内の add / delete 行数から計算する
 * - status は oldPath / newPath の /dev/null 相当 (= null) から判定する
 * - path は newPath を優先し、無ければ oldPath、それも無ければ
 *   呼び出し側から渡された fallbackPath
 * - language は最終的な path + 先頭行から推定
 * - 初版では rename を扱わないため oldPath は常に null
 * - 本関数にたどり着く時点で binary ではない (binary は parser が空にするため)
 */
function toDiffFile(
  parsed: ParsedDiffFile,
  fallbackPath: string,
  firstLine: string | null,
): DiffFile {
  const { additions, deletions } = countLineChanges(parsed)
  const status = inferStatus(parsed)
  const filePath = parsed.newPath ?? parsed.oldPath ?? fallbackPath
  return {
    path: filePath,
    oldPath: null,
    status,
    additions,
    deletions,
    binary: false,
    language: inferLanguage(filePath, firstLine ?? undefined),
    hunks: parsed.hunks,
  }
}

function countLineChanges(parsed: ParsedDiffFile): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const hunk of parsed.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add') additions++
      else if (line.kind === 'delete') deletions++
    }
  }
  return { additions, deletions }
}

function inferStatus(parsed: ParsedDiffFile): DiffFileStatus {
  if (parsed.oldPath === null && parsed.newPath !== null) {
    return 'added'
  }
  if (parsed.oldPath !== null && parsed.newPath === null) {
    return 'deleted'
  }
  return 'modified'
}
