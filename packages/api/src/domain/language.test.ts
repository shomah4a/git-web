import { describe, expect, it } from 'vitest'
import { inferLanguage } from './language.js'

describe('inferLanguage', () => {
  const cases: ReadonlyArray<[string, string | null]> = [
    ['foo.ts', 'typescript'],
    ['src/main.ts', 'typescript'],
    ['App.tsx', 'tsx'],
    ['index.js', 'javascript'],
    ['Component.jsx', 'jsx'],
    ['page.vue', 'vue'],
    ['script.py', 'python'],
    ['main.rs', 'rust'],
    ['server.go', 'go'],
    ['App.java', 'java'],
    ['Main.kt', 'kotlin'],
    ['gem.rb', 'ruby'],
    ['install.sh', 'bash'],
    ['README.md', 'markdown'],
    ['package.json', 'json'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['index.html', 'html'],
    ['styles.css', 'css'],
    ['Cargo.toml', 'toml'],
    ['FOO.TS', 'typescript'], // 大文字拡張子
    ['nested/dir/foo.py', 'python'],
    ['foo.bar.ts', 'typescript'], // 複合拡張子の最終のみ
    ['Makefile', 'makefile'], // ファイル名ベース判定
    ['GNUmakefile', 'makefile'], // ファイル名ベース判定
    ['path/to/Makefile', 'makefile'], // ディレクトリ付きファイル名ベース判定
    ['build.mk', 'makefile'], // .mk 拡張子
    ['.gitignore', null], // 隠しファイル (拡張子なし扱い)
    ['foo.unknown', null], // マッピングに無い拡張子
    ['', null], // 空文字列
    ['path/to/file', null], // 拡張子なし (ディレクトリを含む)
  ]

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(inferLanguage(input)).toBe(expected)
    })
  }
})
