/**
 * `git diff --raw -z` および `git diff --numstat -z` の出力を
 * パースするユーティリティ。
 *
 * 設計方針 (ADR 0012):
 * - `diffSummary` の実装は 2 つの出力を別々にパースしてから path キーで
 *   マージする (M7 対応: 単一コマンド方式より堅牢)
 * - スパイク結果 (.claude/tmp/2026-04-08_jsdiff-spike.md) の Case 8/9 を参照
 * - 初版では rename を modified に丸めるため、rename ヘッダを検出しても
 *   output には oldPath を出さず status を 'modified' にする
 */

import type { DiffFileStatus } from '../../domain/diff.js'

/**
 * --raw -z の 1 エントリに対応する中間表現。
 *
 * status コードの解釈:
 * - A: added
 * - D: deleted
 * - M: modified
 * - R<similarity>: renamed → 'modified' に丸める (初版)
 * - C<similarity>: copied  → 'modified' に丸める (初版)
 * - T: type changed → 'modified' 扱い
 */
export type RawEntry = {
  readonly path: string
  readonly oldPath: string | null
  readonly status: DiffFileStatus
}

/**
 * --numstat -z の 1 エントリに対応する中間表現。
 *
 * バイナリファイルは additions / deletions が null になる (git が "-" を出す)。
 */
export type NumstatEntry = {
  readonly path: string
  readonly additions: number | null
  readonly deletions: number | null
}

/**
 * git diff --raw -z の出力をパースする。
 *
 * 形式:
 *   :<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\0<path>[\0<path2>]\0...
 *
 * - ヘッダ部 (`:`始まり〜<status>まで) は SPACE 区切り
 * - <status> が R<n> または C<n> の場合はパスが 2 つ続く (old → new)
 * - それ以外のステータスはパスが 1 つ
 * - エントリは上記を繰り返す。末尾に trailing NUL があるので split 後に
 *   空要素を無視する
 */
export function parseRawZ(output: string): ReadonlyArray<RawEntry> {
  if (output === '') {
    return []
  }
  const parts = output.split('\0')
  const entries: RawEntry[] = []
  let i = 0
  while (i < parts.length) {
    const head = parts[i]
    if (head === undefined || head === '') {
      i++
      continue
    }
    if (!head.startsWith(':')) {
      // 想定外のフォーマット。スキップして続ける
      i++
      continue
    }
    // ヘッダ部を SPACE 分割
    const headFields = head.split(' ')
    // headFields[0..3] は mode/mode/sha/sha、headFields[4] が status
    const statusCode = headFields[4]
    if (statusCode === undefined) {
      i++
      continue
    }
    const firstLetter = statusCode.charAt(0)
    const isRenameOrCopy = firstLetter === 'R' || firstLetter === 'C'
    const pathIdx = i + 1
    if (isRenameOrCopy) {
      const oldPath = parts[pathIdx]
      const newPath = parts[pathIdx + 1]
      if (oldPath !== undefined && newPath !== undefined) {
        entries.push({
          path: newPath,
          // 初版では rename / copy を modified に丸める
          oldPath: null,
          status: 'modified',
        })
      }
      i = pathIdx + 2
    } else {
      const path = parts[pathIdx]
      if (path !== undefined) {
        entries.push({
          path,
          oldPath: null,
          status: mapStatusCode(firstLetter),
        })
      }
      i = pathIdx + 1
    }
  }
  return entries
}

function mapStatusCode(code: string): DiffFileStatus {
  if (code === 'A') return 'added'
  if (code === 'D') return 'deleted'
  if (code === 'M') return 'modified'
  if (code === 'T') return 'modified'
  // R / C は呼び出し側で処理済み。念のためここでも modified に
  return 'modified'
}

/**
 * git diff --numstat -z の出力をパースする。
 *
 * 形式:
 *   <add>\t<del>\t<path>\0
 *   バイナリ: -\t-\t<path>\0
 *   リネーム: <add>\t<del>\t\0<oldpath>\0<newpath>\0
 *
 * リネーム時は 3 番目のフィールドが空文字列で、次に 2 つのパスが NUL 区切りで
 * 続く。初版では rename を modified に丸めるため newPath のみを採用する。
 */
export function parseNumstatZ(output: string): ReadonlyArray<NumstatEntry> {
  if (output === '') {
    return []
  }
  const parts = output.split('\0')
  const entries: NumstatEntry[] = []
  let i = 0
  while (i < parts.length) {
    const head = parts[i]
    if (head === undefined || head === '') {
      i++
      continue
    }
    const fields = head.split('\t')
    if (fields.length < 3) {
      i++
      continue
    }
    const addRaw = fields[0] ?? ''
    const delRaw = fields[1] ?? ''
    const pathField = fields[2] ?? ''
    const additions = addRaw === '-' ? null : parseNonNegativeInt(addRaw)
    const deletions = delRaw === '-' ? null : parseNonNegativeInt(delRaw)
    if (pathField === '') {
      // リネーム: 次の 2 要素が oldPath, newPath
      const newPath = parts[i + 2]
      if (newPath !== undefined) {
        entries.push({ path: newPath, additions, deletions })
      }
      i = i + 3
    } else {
      entries.push({ path: pathField, additions, deletions })
      i = i + 1
    }
  }
  return entries
}

function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }
  return Number.parseInt(raw, 10)
}
