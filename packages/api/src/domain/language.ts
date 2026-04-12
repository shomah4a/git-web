/**
 * ファイルパスから言語名を推定する。
 *
 * 設計方針 (ADR 0012 / ADR 0029 / ADR 0030):
 * - 拡張子ベースの単純マッピング
 * - ファイル名ベースのマッピング（拡張子なしファイル向け）
 * - shebang ベースのマッピング（先頭行が渡された場合のフォールバック）
 * - 戻り値の言語名は Shiki / VS Code の TextMate grammar 識別子を意識する
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
  mk: 'makefile',
  pl: 'perl',
  php: 'php',
  lua: 'lua',
  awk: 'awk',
  r: 'r',
  groovy: 'groovy',
  scala: 'scala',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  cr: 'crystal',
  jl: 'julia',
  swift: 'swift',
  dart: 'dart',
  nim: 'nim',
  tcl: 'tcl',
  ml: 'ocaml',
  rkt: 'racket',
  scm: 'scheme',
  fnl: 'fennel',
  nu: 'nushell',
  zsh: 'zsh',
  fish: 'fish',
}

/** ファイル名(拡張子なし)から言語を判定するマッピング */
const FILENAME_TO_LANGUAGE: Readonly<Record<string, string>> = {
  makefile: 'makefile',
  gnumakefile: 'makefile',
}

/** shebang のコマンド名から言語を判定するマッピング */
const SHEBANG_COMMAND_TO_LANGUAGE: Readonly<Record<string, string>> = {
  sh: 'shellscript',
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  python: 'python',
  python3: 'python',
  ruby: 'ruby',
  perl: 'perl',
  perl5: 'perl',
  perl6: 'perl6',
  raku: 'perl6',
  node: 'javascript',
  lua: 'lua',
  luajit: 'lua',
  php: 'php',
  awk: 'awk',
  gawk: 'awk',
  mawk: 'awk',
  nawk: 'awk',
  Rscript: 'r',
  groovy: 'groovy',
  scala: 'scala',
  elixir: 'elixir',
  erlang: 'erlang',
  escript: 'erlang',
  crystal: 'crystal',
  julia: 'julia',
  swift: 'swift',
  dart: 'dart',
  nim: 'nim',
  tcl: 'tcl',
  tclsh: 'tcl',
  wish: 'tcl',
  ocaml: 'ocaml',
  racket: 'racket',
  scheme: 'scheme',
  fennel: 'fennel',
  nu: 'nushell',
  nushell: 'nushell',
  'ts-node': 'typescript',
  deno: 'typescript',
  bun: 'javascript',
}

/**
 * ファイルパスから言語名を推定する。
 *
 * 判定優先順序 (ADR 0030):
 * 1. 拡張子あり → EXTENSION_TO_LANGUAGE
 * 2. 拡張子なし → FILENAME_TO_LANGUAGE
 * 3. firstLine が渡されていれば shebang パース → SHEBANG_COMMAND_TO_LANGUAGE
 * 4. いずれにも該当しない → null
 *
 * firstLine はオプショナル。呼び出し側がファイル内容を持っている場合にのみ
 * 先頭行を渡す（副作用の外部化原則）。
 */
export function inferLanguage(path: string, firstLine?: string): string | null {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const lastDot = basename.lastIndexOf('.')
  if (lastDot <= 0) {
    // 拡張子なし、または隠しファイル (.foo のようにドットが先頭)
    // ファイル名そのもので判定を試みる
    const byFilename = FILENAME_TO_LANGUAGE[basename.toLowerCase()] ?? null
    if (byFilename !== null) {
      return byFilename
    }
    return firstLine !== undefined ? inferLanguageFromShebang(firstLine) : null
  }
  const ext = basename.slice(lastDot + 1).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] ?? null
}

/**
 * shebang 行からコマンド名を抽出し、言語を判定する。
 *
 * 対応形式:
 * - 直接パス: #!/bin/bash, #!/usr/bin/python3
 * - env 経由: #!/usr/bin/env node
 * - env -S 経由: #!/usr/bin/env -S python3
 */
function inferLanguageFromShebang(firstLine: string): string | null {
  if (!firstLine.startsWith('#!')) {
    return null
  }
  const content = firstLine.slice(2).trim()
  const tokens = content.split(/\s+/)
  const interpreterPath = tokens[0]
  if (interpreterPath === undefined || interpreterPath === '') {
    return null
  }
  const lastSlash = interpreterPath.lastIndexOf('/')
  const interpreterName = lastSlash >= 0 ? interpreterPath.slice(lastSlash + 1) : interpreterPath

  if (interpreterName === 'env') {
    // #!/usr/bin/env [-S] <cmd>
    const next = tokens[1]
    if (next === undefined || next === '') {
      return null
    }
    if (next === '-S') {
      const cmd = tokens[2]
      if (cmd === undefined || cmd === '') {
        return null
      }
      return SHEBANG_COMMAND_TO_LANGUAGE[cmd] ?? null
    }
    return SHEBANG_COMMAND_TO_LANGUAGE[next] ?? null
  }

  return SHEBANG_COMMAND_TO_LANGUAGE[interpreterName] ?? null
}
