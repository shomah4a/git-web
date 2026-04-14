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
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  hs: 'haskell',
  lhs: 'haskell',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  elm: 'elm',
  purs: 'purescript',
  el: 'emacs-lisp',
  lean: 'lean',
  hcl: 'hcl',
  tf: 'terraform',
  tfvars: 'terraform',
  nix: 'nix',
  bat: 'bat',
  cmd: 'bat',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  ini: 'ini',
  cmake: 'cmake',
  xml: 'xml',
  xsl: 'xml',
  xsd: 'xml',
  svg: 'xml',
  plist: 'xml',
  proto: 'protobuf',
  sql: 'sql',
  reg: 'reg',
  bicep: 'bicep',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  svelte: 'svelte',
  astro: 'astro',
  pug: 'pug',
  jade: 'pug',
  haml: 'haml',
  hbs: 'handlebars',
  erb: 'erb',
  mdx: 'mdx',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  liquid: 'liquid',
  twig: 'twig',
  razor: 'razor',
  coffee: 'coffeescript',
  csv: 'csv',
  tsv: 'tsv',
  jsonc: 'jsonc',
  json5: 'json5',
  jsonl: 'jsonl',
  hjson: 'hjson',
  rst: 'rst',
  adoc: 'asciidoc',
  tex: 'latex',
  bib: 'bibtex',
  diff: 'diff',
  patch: 'diff',
  zig: 'zig',
  d: 'd',
  sol: 'solidity',
  vb: 'vb',
  vhd: 'vhdl',
  vhdl: 'vhdl',
  sv: 'system-verilog',
  gleam: 'gleam',
  odin: 'odin',
  ada: 'ada',
  adb: 'ada',
  ads: 'ada',
  pas: 'pascal',
  p6: 'perl6',
  raku: 'perl6',
  cob: 'cobol',
  cobol: 'cobol',
  f90: 'fortran-free-form',
  f95: 'fortran-free-form',
  f03: 'fortran-free-form',
  f08: 'fortran-free-form',
  gd: 'gdscript',
  vim: 'viml',
  scad: 'openscad',
  typ: 'typst',
  wgsl: 'wgsl',
  glsl: 'glsl',
  hlsl: 'hlsl',
  mojo: 'mojo',
  pkl: 'pkl',
  ron: 'ron',
  kdl: 'kdl',
  cue: 'cue',
  wl: 'wolfram',
  vala: 'vala',
  move: 'move',
  luau: 'luau',
  qml: 'qml',
}

/** ファイル名(拡張子なし)から言語を判定するマッピング */
const FILENAME_TO_LANGUAGE: Readonly<Record<string, string>> = {
  makefile: 'makefile',
  gnumakefile: 'makefile',
  dockerfile: 'dockerfile',
  justfile: 'just',
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
