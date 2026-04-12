import { describe, expect, it } from 'vitest'
import { inferLanguage } from './language.js'

describe('inferLanguage', () => {
  describe('拡張子ベース判定', () => {
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
      ['build.mk', 'makefile'],
      ['script.pl', 'perl'],
      ['index.php', 'php'],
      ['init.lua', 'lua'],
      ['data.awk', 'awk'],
      ['analysis.r', 'r'],
      ['build.groovy', 'groovy'],
      ['Main.scala', 'scala'],
      ['app.ex', 'elixir'],
      ['test_helper.exs', 'elixir'],
      ['server.erl', 'erlang'],
      ['app.cr', 'crystal'],
      ['solve.jl', 'julia'],
      ['main.swift', 'swift'],
      ['app.dart', 'dart'],
      ['tool.nim', 'nim'],
      ['script.tcl', 'tcl'],
      ['parser.ml', 'ocaml'],
      ['main.rkt', 'racket'],
      ['lib.scm', 'scheme'],
      ['init.fnl', 'fennel'],
      ['config.nu', 'nushell'],
      ['prompt.zsh', 'zsh'],
      ['config.fish', 'fish'],
      ['FOO.TS', 'typescript'],
      ['nested/dir/foo.py', 'python'],
      ['foo.bar.ts', 'typescript'],
    ]

    for (const [input, expected] of cases) {
      it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
        expect(inferLanguage(input)).toBe(expected)
      })
    }
  })

  describe('ファイル名ベース判定', () => {
    const cases: ReadonlyArray<[string, string | null]> = [
      ['Makefile', 'makefile'],
      ['GNUmakefile', 'makefile'],
      ['path/to/Makefile', 'makefile'],
    ]

    for (const [input, expected] of cases) {
      it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
        expect(inferLanguage(input)).toBe(expected)
      })
    }
  })

  describe('shebang ベース判定', () => {
    describe('直接パス', () => {
      const cases: ReadonlyArray<[string, string, string]> = [
        ['script', '#!/bin/bash', 'bash'],
        ['script', '#!/bin/sh', 'shellscript'],
        ['script', '#!/usr/bin/python3', 'python'],
        ['script', '#!/usr/bin/ruby', 'ruby'],
        ['script', '#!/usr/bin/perl', 'perl'],
        ['script', '#!/usr/local/bin/lua', 'lua'],
        ['script', '#!/usr/bin/php', 'php'],
        ['script', '#!/bin/zsh', 'zsh'],
        ['script', '#!/usr/bin/fish', 'fish'],
      ]

      for (const [path, firstLine, expected] of cases) {
        it(`${JSON.stringify(path)} + ${JSON.stringify(firstLine)} → ${JSON.stringify(expected)}`, () => {
          expect(inferLanguage(path, firstLine)).toBe(expected)
        })
      }
    })

    describe('env 経由', () => {
      const cases: ReadonlyArray<[string, string, string]> = [
        ['script', '#!/usr/bin/env python3', 'python'],
        ['script', '#!/usr/bin/env node', 'javascript'],
        ['script', '#!/usr/bin/env ruby', 'ruby'],
        ['script', '#!/usr/bin/env bash', 'bash'],
        ['script', '#!/usr/bin/env perl', 'perl'],
        ['script', '#!/usr/bin/env lua', 'lua'],
        ['script', '#!/usr/bin/env elixir', 'elixir'],
        ['script', '#!/usr/bin/env Rscript', 'r'],
        ['script', '#!/usr/bin/env racket', 'racket'],
        ['script', '#!/usr/bin/env nu', 'nushell'],
      ]

      for (const [path, firstLine, expected] of cases) {
        it(`${JSON.stringify(path)} + ${JSON.stringify(firstLine)} → ${JSON.stringify(expected)}`, () => {
          expect(inferLanguage(path, firstLine)).toBe(expected)
        })
      }
    })

    describe('env -S 経由', () => {
      const cases: ReadonlyArray<[string, string, string]> = [
        ['script', '#!/usr/bin/env -S python3', 'python'],
        ['script', '#!/usr/bin/env -S node', 'javascript'],
        ['script', '#!/usr/bin/env -S ts-node', 'typescript'],
        ['script', '#!/usr/bin/env -S deno', 'typescript'],
        ['script', '#!/usr/bin/env -S bun', 'javascript'],
      ]

      for (const [path, firstLine, expected] of cases) {
        it(`${JSON.stringify(path)} + ${JSON.stringify(firstLine)} → ${JSON.stringify(expected)}`, () => {
          expect(inferLanguage(path, firstLine)).toBe(expected)
        })
      }
    })

    describe('拡張子判定が優先される', () => {
      it('拡張子ありのファイルでは shebang を無視する', () => {
        expect(inferLanguage('script.py', '#!/usr/bin/env ruby')).toBe('python')
      })
    })

    describe('shebang でない先頭行', () => {
      it('先頭行が #! で始まらなければ null', () => {
        expect(inferLanguage('script', '# just a comment')).toBeNull()
      })

      it('先頭行が空文字列なら null', () => {
        expect(inferLanguage('script', '')).toBeNull()
      })

      it('未知のコマンド名なら null', () => {
        expect(inferLanguage('script', '#!/usr/bin/unknown-cmd')).toBeNull()
      })
    })

    describe('firstLine が渡されない場合', () => {
      it('拡張子なしファイル名マッチなしで null', () => {
        expect(inferLanguage('script')).toBeNull()
      })
    })
  })

  describe('判定不能', () => {
    const cases: ReadonlyArray<[string, string | null]> = [
      ['.gitignore', null],
      ['foo.unknown', null],
      ['', null],
      ['path/to/file', null],
    ]

    for (const [input, expected] of cases) {
      it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
        expect(inferLanguage(input)).toBe(expected)
      })
    }
  })
})
