/**
 * ファイルパスから言語名を推定する。
 *
 * 設計方針 (ADR 0012):
 * - 拡張子ベースの単純マッピング
 * - 戻り値の言語名は Shiki / VS Code の TextMate grammar 識別子を意識する
 * - 将来 Shiki 統合時に presentation 寄りの層 (adapter/shiki/ や front 側)
 *   に移す可能性がある
 * - マッピングに存在しない拡張子は null を返す
 */

const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  sh: 'bash',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  html: 'html',
  css: 'css',
  toml: 'toml',
}

/**
 * ファイルパスから言語名を推定する。
 *
 * - ドットを含むファイル名の最終拡張子のみ見る (例: "foo.d.ts" → "ts")
 * - 拡張子が無い / マッピングに無いファイルは null
 * - 大文字拡張子は小文字に正規化してから引く
 */
export function inferLanguage(path: string): string | null {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const lastDot = basename.lastIndexOf('.')
  if (lastDot <= 0) {
    // 拡張子なし、または隠しファイル (.foo のようにドットが先頭)
    return null
  }
  const ext = basename.slice(lastDot + 1).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] ?? null
}
