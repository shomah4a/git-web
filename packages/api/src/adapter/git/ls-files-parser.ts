/**
 * `git ls-files -z` の出力から指定パス配下の 1 階層分のエントリを抽出する (ADR 0022)。
 *
 * git ls-files はフラットにファイルパスを列挙するため、
 * 指定パスプレフィックスでフィルタし、次のスラッシュの有無で
 * ファイル (blob) / ディレクトリ (tree) を判定する。
 * ディレクトリは重複排除して 1 エントリにまとめる。
 */

import type { TreeEntry, TreeEntryStatus } from '../../domain/tree.js'

/**
 * git ls-files -z の stdout から、指定 basePath 直下の 1 階層分の
 * エントリを抽出する。
 *
 * @param stdout git ls-files -z の出力 (NUL 区切り)
 * @param basePath 問い合わせたパス (空文字 = ルート)
 * @param statusMap git status から得たパス→ステータスの Map
 */
export function extractOneLevel(
  stdout: string,
  basePath: string,
  statusMap: ReadonlyMap<string, TreeEntryStatus>,
): ReadonlyArray<TreeEntry> {
  if (stdout.length === 0) {
    return []
  }

  const prefix = basePath === '' ? '' : `${basePath}/`
  const seenDirs = new Set<string>()
  const entries: TreeEntry[] = []

  const paths = stdout.split('\0')
  for (const filePath of paths) {
    if (filePath.length === 0) {
      continue
    }

    // basePath 配下でなければスキップ
    if (prefix !== '' && !filePath.startsWith(prefix)) {
      continue
    }

    const relative = prefix === '' ? filePath : filePath.slice(prefix.length)
    const slashIdx = relative.indexOf('/')

    if (slashIdx === -1) {
      // ファイル (blob)
      const name = relative
      const path = basePath === '' ? name : `${basePath}/${name}`
      const status = statusMap.get(filePath) ?? null
      entries.push({ name, path, type: 'blob', status, mode: null, size: null })
    } else {
      // ディレクトリ (tree) — 重複排除
      const dirName = relative.slice(0, slashIdx)
      if (!seenDirs.has(dirName)) {
        seenDirs.add(dirName)
        const path = basePath === '' ? dirName : `${basePath}/${dirName}`
        entries.push({ name: dirName, path, type: 'tree', status: null, mode: null, size: null })
      }
    }
  }

  return entries
}
