/**
 * `git ls-tree -l -z` の出力をパースする (ADR 0022, ADR 0026)。
 *
 * フォーマット: `<mode> <type> <hash> <size>\t<path>\0` の繰り返し
 *
 * - `-l` オプションにより size フィールドが追加される
 *   - blob の場合は数値、tree の場合は `-`
 *   - size はスペースパディングされるため、split 後に空文字列除去が必要
 * - `-z` オプションにより NUL セパレータで区切られる
 * - ファイル名にタブや改行を含むケースにも対応する
 */

import type { TreeEntry, TreeEntryType } from '../../domain/tree.js'

/**
 * `git ls-tree -l -z` の stdout をパースして TreeEntry 配列を返す。
 *
 * @param stdout git ls-tree -l -z の出力 (NUL 区切り)
 * @param basePath 問い合わせたパス (エントリの相対パス算出に使用)
 */
export function parseLsTreeZ(stdout: string, basePath: string): ReadonlyArray<TreeEntry> {
  if (stdout.length === 0) {
    return []
  }

  const entries: TreeEntry[] = []
  // NUL 区切りで分割。末尾が NUL の場合、最後の空文字列要素を除去
  const records = stdout.split('\0')

  for (const record of records) {
    if (record.length === 0) {
      continue
    }
    const entry = parseRecord(record, basePath)
    if (entry !== null) {
      entries.push(entry)
    }
  }

  return entries
}

/**
 * 1 レコード (`<mode> <type> <hash> <size>\t<path>`) をパースする。
 *
 * `-l` オプション付きの場合、size フィールドがスペースパディングされるため
 * split 後に空文字列要素を除去する。
 */
function parseRecord(record: string, basePath: string): TreeEntry | null {
  // ヘッダー部とパス部はタブで区切られる
  const tabIndex = record.indexOf('\t')
  if (tabIndex === -1) {
    return null
  }

  const header = record.slice(0, tabIndex)
  const fullPath = record.slice(tabIndex + 1)

  // ヘッダーは "<mode> <type> <hash> <size>"
  // size はスペースパディングされるため空文字列を除去する
  const parts = header.split(' ').filter((s) => s.length > 0)
  if (parts.length < 4) {
    return null
  }

  const mode = parts[0] ?? ''
  const rawType = parts[1] ?? ''
  const type = toTreeEntryType(rawType)
  if (type === null) {
    return null
  }

  // parts[3] は size: blob なら数値文字列、tree なら "-"
  const rawSize = parts[3] ?? '-'
  const size = rawSize === '-' ? null : Number(rawSize)

  // name はパスの最後のセグメント
  const lastSlash = fullPath.lastIndexOf('/')
  const name = lastSlash === -1 ? fullPath : fullPath.slice(lastSlash + 1)

  // path は basePath を前置してリポジトリルートからの相対パスにする
  const path = basePath === '' ? fullPath : `${basePath}/${fullPath}`

  return { name, path, type, status: null, mode, size }
}

function toTreeEntryType(raw: string): TreeEntryType | null {
  if (raw === 'blob') {
    return 'blob'
  }
  if (raw === 'tree') {
    return 'tree'
  }
  // commit (submodule) 等は無視
  return null
}
