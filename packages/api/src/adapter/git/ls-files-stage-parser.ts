/**
 * `git ls-files --stage -z` の出力をパースして mode を抽出する (ADR 0023)。
 *
 * フォーマット: `<mode> <hash> <stage>\t<path>\0` の繰り返し。
 * 例: `100644 abc123 0\tREADME.md\0`
 */

/**
 * `git ls-files --stage -z` の stdout をパースして
 * パス→ mode 文字列の Map を返す。
 */
export function parseLsFilesStageZ(stdout: string): ReadonlyMap<string, string> {
  if (stdout.length === 0) {
    return new Map()
  }

  const result = new Map<string, string>()
  const entries = stdout.split('\0')

  for (const entry of entries) {
    if (entry.length === 0) {
      continue
    }

    const tabIdx = entry.indexOf('\t')
    if (tabIdx === -1) {
      continue
    }

    const meta = entry.slice(0, tabIdx)
    const path = entry.slice(tabIdx + 1)

    // meta = "<mode> <hash> <stage>"
    const spaceIdx = meta.indexOf(' ')
    if (spaceIdx === -1) {
      continue
    }

    const mode = meta.slice(0, spaceIdx)
    if (mode.length > 0 && path.length > 0) {
      result.set(path, mode)
    }
  }

  return result
}
