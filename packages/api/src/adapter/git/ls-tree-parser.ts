/**
 * `git ls-tree -z` の出力をパースする (ADR 0022)。
 *
 * フォーマット: `<mode> <type> <hash>\t<path>\0` の繰り返し
 *
 * - `-z` オプションにより NUL セパレータで区切られる
 * - ファイル名にタブや改行を含むケースにも対応する
 */

import type { TreeEntry, TreeEntryType } from '../../domain/tree.js'

/**
 * `git ls-tree -z` の stdout をパースして TreeEntry 配列を返す。
 *
 * @param stdout git ls-tree -z の出力 (NUL 区切り)
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
 * 1 レコード (`<mode> <type> <hash>\t<path>`) をパースする。
 */
function parseRecord(record: string, basePath: string): TreeEntry | null {
  // ヘッダー部とパス部はタブで区切られる
  const tabIndex = record.indexOf('\t')
  if (tabIndex === -1) {
    return null
  }

  const header = record.slice(0, tabIndex)
  const fullPath = record.slice(tabIndex + 1)

  // ヘッダーは "<mode> <type> <hash>"
  const parts = header.split(' ')
  if (parts.length < 3) {
    return null
  }

  const rawType = parts[1] ?? ''
  const type = toTreeEntryType(rawType)
  if (type === null) {
    return null
  }

  // name はパスの最後のセグメント
  const lastSlash = fullPath.lastIndexOf('/')
  const name = lastSlash === -1 ? fullPath : fullPath.slice(lastSlash + 1)

  // path は basePath を前置してリポジトリルートからの相対パスにする
  const path = basePath === '' ? fullPath : `${basePath}/${fullPath}`

  return { name, path, type, status: null }
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
