/**
 * `git log --format=<structured> --name-only` の出力をパースする (ADR 0054)。
 *
 * 設計方針:
 * - レコードセパレータに NUL (%x00)、フィールドセパレータに SOH (%x01) を使用する
 *   (ADR 0046 log-parser と同じ規約)
 * - フォーマット文字列: `%x00%H%x01%ct%x01%s%x01`
 *   末尾 %x01 は subject と続く name-only ブロック (改行区切り) の境界マーカ
 * - --name-only ブロックは改行区切りでファイルパスが列挙される
 * - パス中の非 ASCII / タブ / 改行は git の core.quotePath=true (CLI 側で強制)
 *   により C-style クォートされた状態で出てくる。本パーサは生の文字列として
 *   そのまま返し、unquote はしない
 */

/**
 * パーサが返す 1 コミット分のレコード。
 *
 * - hash: 40 桁 SHA-1
 * - date: UNIX epoch 秒
 * - subject: コミット subject (1 行目)
 * - paths: 当該コミットで変更されたパス一覧 (リポルート相対、core.quotePath 通過後)
 */
export type ParsedTreeCommitRecord = {
  readonly hash: string
  readonly date: number
  readonly subject: string
  readonly paths: ReadonlyArray<string>
}

/**
 * git log --name-only の stdout を ParsedTreeCommitRecord の配列に変換する。
 *
 * 二段分解:
 * 1. \x00 でレコード分割 (先頭の空要素は捨てる)
 * 2. 各レコードを \x01 で 4 フィールド分割: [hash, date, subject, namesBlock]
 * 3. namesBlock を \n 分割し、空行を除いてパス配列にする
 */
export function parseTreeCommitsOutput(stdout: string): ReadonlyArray<ParsedTreeCommitRecord> {
  if (stdout.length === 0) {
    return []
  }

  const records = stdout.split('\0')
  const result: ParsedTreeCommitRecord[] = []

  for (const record of records) {
    if (record.length === 0) {
      continue
    }
    const parsed = parseRecord(record)
    if (parsed !== null) {
      result.push(parsed)
    }
  }

  return result
}

function parseRecord(record: string): ParsedTreeCommitRecord | null {
  const parts = record.split('\x01')
  if (parts.length < 4) {
    return null
  }

  const hash = parts[0]
  const dateRaw = parts[1]
  const subject = parts[2]
  const namesBlock = parts[3]

  if (
    hash === undefined ||
    dateRaw === undefined ||
    subject === undefined ||
    namesBlock === undefined
  ) {
    return null
  }
  if (hash === '') {
    return null
  }

  const date = Number.parseInt(dateRaw, 10)
  if (Number.isNaN(date)) {
    return null
  }

  const paths = namesBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return { hash, date, subject, paths }
}
