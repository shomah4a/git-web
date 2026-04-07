/**
 * jsdiff (`diff` パッケージ) の parsePatch を呼び出す DiffParser 実装。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - jsdiff の型と存在はこのファイルに閉じ込める
 * - 戻り値はドメイン型 ParsedDiffFile に変換する
 * - スパイク結果 (.claude/tmp/2026-04-08_jsdiff-spike.md) を反映:
 *   - 空 diff / rename only / binary は jsdiff が「空の hunks」として返す
 *   - ファイル名に git の "a/" "b/" プレフィックスが付く (除去する)
 *   - 追加ファイルは oldFileName が "/dev/null"
 *   - 削除ファイルは newFileName が "/dev/null"
 *   - `\ No newline at end of file` がそのまま lines に入る (除外する)
 *   - 空 diff の場合 jsdiff は StructuredPatch の fileName を実行時に
 *     undefined で返すことがある (型定義は string だが実態は緩い)
 */

import { parsePatch } from 'diff'
import type { DiffHunk, DiffLine } from '../../domain/diff.js'
import type { DiffParser, ParsedDiffFile } from '../../domain/ports/diff-parser.js'

/**
 * DiffParser の実装。関数として export する。
 */
export const jsdiffParser: DiffParser = (patchText) => {
  if (patchText === '') {
    return []
  }
  const parsed = parsePatch(patchText)
  const result: ParsedDiffFile[] = []
  for (const file of parsed) {
    const oldPath = normalizePath(file.oldFileName)
    const newPath = normalizePath(file.newFileName)
    // 空 diff / rename only / binary の場合、jsdiff は fileName を
    // undefined/空文字列で返し、かつ hunks も空になる。これらは
    // 「unified diff として意味のあるコンテンツ無し」として除外する。
    if (oldPath === null && newPath === null && file.hunks.length === 0) {
      continue
    }
    result.push({
      oldPath,
      newPath,
      hunks: file.hunks.map(toDiffHunk),
    })
  }
  return result
}

/**
 * jsdiff が返すファイル名を正規化する。
 *
 * - undefined / 空文字列 → null (ファイル名情報なし)
 * - "/dev/null" → null (added / deleted 側を示す)
 * - "a/foo.ts" / "b/foo.ts" → "foo.ts" (git の a/ b/ プレフィックスを除去)
 * - その他はそのまま
 *
 * 型定義上は string だが実行時に undefined が来ることがあるため
 * unknown 経由で narrow する。
 */
function normalizePath(fileName: string): string | null {
  const value: unknown = fileName
  if (typeof value !== 'string' || value === '') {
    return null
  }
  if (value === '/dev/null') {
    return null
  }
  if (value.startsWith('a/') || value.startsWith('b/')) {
    return value.slice(2)
  }
  return value
}

type JsdiffHunk = {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: ReadonlyArray<string>
}

/**
 * jsdiff の hunk をドメインの DiffHunk に変換する。
 *
 * 行のマーカー (+/-/space) を除去し、旧/新の行番号を計算する。
 * "\ No newline at end of file" 行 (先頭が "\") は除外する。
 */
function toDiffHunk(hunk: JsdiffHunk): DiffHunk {
  const lines: DiffLine[] = []
  let oldLineNo = hunk.oldStart
  let newLineNo = hunk.newStart
  for (const raw of hunk.lines) {
    if (raw.startsWith('\\')) {
      // "\ No newline at end of file" 等のマーカー行
      continue
    }
    if (raw === '') {
      // 想定外の空行はスキップ
      continue
    }
    const marker = raw.charAt(0)
    const content = raw.slice(1)
    if (marker === '+') {
      lines.push({ kind: 'add', content, oldLineNo: null, newLineNo })
      newLineNo++
    } else if (marker === '-') {
      lines.push({ kind: 'delete', content, oldLineNo, newLineNo: null })
      oldLineNo++
    } else {
      // コンテキスト行 (先頭スペースまたはその他)
      lines.push({ kind: 'context', content, oldLineNo, newLineNo })
      oldLineNo++
      newLineNo++
    }
  }
  return {
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    header: '',
    lines,
  }
}
