/**
 * `git log --format=<structured> --numstat` の出力をパースするユーティリティ (ADR 0046)。
 *
 * 設計方針:
 * - レコードセパレータに NUL (%x00)、フィールドセパレータに SOH (%x01) を使用し、
 *   改行を含むコミットメッセージでも安全にパースできる
 * - --numstat の行は各コミットレコードの後に改行区切りで出力される
 * - バイナリファイルの numstat は "-\t-\t<path>" になるため、数値変換失敗時は 0 とする
 */

import type { CommitEntry, CommitStats } from '../../domain/commit.js'

/**
 * git log に渡す --format 文字列。
 *
 * フィールド順: hash / authorName / authorEmail / date(ISO) / subject / body
 * 末尾の %x01 は body 後のセパレータとして、numstat 行との分離に使う。
 */
export const LOG_FORMAT = '%x00%H%x01%an%x01%ae%x01%aI%x01%s%x01%b%x01'

/**
 * git log の stdout をパースして CommitEntry の配列を返す。
 */
export function parseLogOutput(stdout: string): ReadonlyArray<CommitEntry> {
  if (stdout.length === 0) {
    return []
  }

  // NUL で分割。先頭の NUL の前は空文字列になるため除去する
  const records = stdout.split('\0')
  const result: CommitEntry[] = []

  for (const record of records) {
    if (record.trim().length === 0) {
      continue
    }

    const entry = parseRecord(record)
    if (entry !== null) {
      result.push(entry)
    }
  }

  return result
}

/**
 * 1 レコード (NUL 区切りの 1 ブロック) をパースする。
 *
 * レコード構造:
 *   <hash>\x01<authorName>\x01<authorEmail>\x01<date>\x01<subject>\x01<body>\x01
 *   <numstat lines (改行区切り)>
 */
function parseRecord(record: string): CommitEntry | null {
  // SOH でフィールド分割
  const parts = record.split('\x01')
  if (parts.length < 7) {
    return null
  }

  const hash = parts[0]?.trim()
  const authorName = parts[1]
  const authorEmail = parts[2]
  const date = parts[3]
  const subject = parts[4]
  const body = parts[5]?.trim()
  // parts[6] 以降は末尾 SOH の後ろ — numstat 行が入る
  const numstatRaw = parts[6]

  if (
    hash === undefined ||
    authorName === undefined ||
    authorEmail === undefined ||
    date === undefined ||
    subject === undefined ||
    body === undefined ||
    numstatRaw === undefined
  ) {
    return null
  }

  const stats = parseNumstatBlock(numstatRaw)

  return {
    hash,
    authorName,
    authorEmail,
    date,
    subject,
    body,
    stats,
  }
}

/**
 * numstat ブロック (改行区切りのテキスト) をパースして統計を返す。
 *
 * 各行の形式: "<additions>\t<deletions>\t<path>"
 * バイナリファイルは "-\t-\t<path>" になる。
 */
function parseNumstatBlock(raw: string): CommitStats {
  const lines = raw.split('\n').filter((line) => line.length > 0)
  let filesChanged = 0
  let insertions = 0
  let deletions = 0

  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length < 3) {
      continue
    }
    filesChanged++
    const add = Number.parseInt(parts[0] ?? '', 10)
    const del = Number.parseInt(parts[1] ?? '', 10)
    if (!Number.isNaN(add)) {
      insertions += add
    }
    if (!Number.isNaN(del)) {
      deletions += del
    }
  }

  return { filesChanged, insertions, deletions }
}
