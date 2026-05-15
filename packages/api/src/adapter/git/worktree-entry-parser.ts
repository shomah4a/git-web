/**
 * worktree エントリ抽出パーサー (ADR 0023)。
 *
 * git ls-files の出力から 1 階層分のエントリを抽出し、
 * mode / status / size のメタデータを付与する。
 *
 * 既存の ls-files-parser.ts (ADR 0022) を拡張せず、
 * worktree 専用の型 (WorktreeEntry) を返す新パーサーとして分離する。
 */

import type { WorktreeEntry, WorktreeEntryStatus } from '../../domain/worktree-entry.js'

/**
 * git ls-files -z の stdout + メタデータ Map 群から、
 * 指定 basePath 直下の 1 階層分の WorktreeEntry を抽出する。
 *
 * @param stdout git ls-files -z の出力 (NUL 区切り)
 * @param basePath 問い合わせたパス (空文字 = ルート)
 * @param statusMap git status から得たパス→ステータスの Map
 * @param modeMap git ls-files --stage から得たパス→ mode の Map
 * @param sizeMap fs.stat から得たパス→ size の Map (取得失敗は含まない)
 */
export function extractWorktreeOneLevel(
  stdout: string,
  basePath: string,
  statusMap: ReadonlyMap<string, WorktreeEntryStatus>,
  modeMap: ReadonlyMap<string, string>,
  sizeMap: ReadonlyMap<string, number>,
): ReadonlyArray<WorktreeEntry> {
  if (stdout.length === 0) {
    return []
  }

  const prefix = basePath === '' ? '' : `${basePath}/`
  const seenDirs = new Set<string>()
  const entries: WorktreeEntry[] = []

  const paths = stdout.split('\0')
  for (const filePath of paths) {
    if (filePath.length === 0) {
      continue
    }

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
      const mode = modeMap.get(filePath) ?? null
      const size = sizeMap.get(filePath) ?? null
      entries.push({ status, name, path, type: 'blob', mode, size })
    } else {
      // ディレクトリ (tree)
      const dirName = relative.slice(0, slashIdx)
      if (!seenDirs.has(dirName)) {
        seenDirs.add(dirName)
        const path = basePath === '' ? dirName : `${basePath}/${dirName}`
        const status = aggregateDirStatus(path, statusMap)
        entries.push({ status, name: dirName, path, type: 'tree', mode: '040000', size: null })
      }
    }
  }

  return entries
}

/**
 * ディレクトリ配下の変更ファイルから status を集約する。
 *
 * - 配下に変更がなければ null
 * - 配下の変更タイプが 1 種類なら、そのタイプをそのまま返す
 * - 複数種類が混在する場合は 'modified' で代表させる
 */
function aggregateDirStatus(
  dirPath: string,
  statusMap: ReadonlyMap<string, WorktreeEntryStatus>,
): WorktreeEntryStatus {
  const dirPrefix = `${dirPath}/`
  let found: WorktreeEntryStatus = null
  for (const [key, status] of statusMap) {
    if (key.startsWith(dirPrefix)) {
      if (found === null) {
        found = status
      } else if (found !== status) {
        return 'modified'
      }
    }
  }
  return found
}

/**
 * `git ls-files --others --ignored --exclude-standard --directory -z` の出力から
 * 1 階層分の ignored エントリを抽出する (ADR 0055)。
 *
 * - 出力中、末尾 `/` 付きはディレクトリ、なしはファイル
 * - basePath 配下に限定。さらに既存 (tracked/untracked) entry の name と
 *   衝突するものは除外する (例: `.claude` ディレクトリ自体は tracked エントリ経由で
 *   出ているが、その配下の ignored `tmp/` は basePath='.claude' で `tmp` として出す)
 *
 * @param stdout `git ls-files ... -z` の出力
 * @param basePath 問い合わせたパス (空文字 = ルート)
 * @param existingNames 既に entries に含まれる name の集合 (重複防止)
 */
export function extractIgnoredOneLevel(
  stdout: string,
  basePath: string,
  existingNames: ReadonlySet<string>,
): ReadonlyArray<WorktreeEntry> {
  if (stdout.length === 0) {
    return []
  }

  const prefix = basePath === '' ? '' : `${basePath}/`
  const seen = new Set<string>(existingNames)
  const entries: WorktreeEntry[] = []

  const paths = stdout.split('\0')
  for (const raw of paths) {
    if (raw.length === 0) {
      continue
    }
    if (prefix !== '' && !raw.startsWith(prefix)) {
      continue
    }

    const isDir = raw.endsWith('/')
    const trimmed = isDir ? raw.slice(0, -1) : raw
    const relative = prefix === '' ? trimmed : trimmed.slice(prefix.length)
    if (relative === '') {
      continue
    }
    const slashIdx = relative.indexOf('/')

    // ignored は --directory で 1 階層単位に丸められる前提だが、子ファイル単独で
    // 出る (ディレクトリ全体が ignored ではない場合の) ケースもある。1 階層の
    // 親 name を取り、type は親が tree (slashIdx >= 0 もしくは isDir) かで決める。
    const name = slashIdx === -1 ? relative : relative.slice(0, slashIdx)
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    const path = basePath === '' ? name : `${basePath}/${name}`
    const type = isDir || slashIdx !== -1 ? 'tree' : 'blob'
    entries.push({
      status: 'ignored',
      name,
      path,
      type,
      mode: type === 'tree' ? '040000' : null,
      size: null,
    })
  }

  return entries
}
