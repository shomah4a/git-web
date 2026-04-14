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
      ['lib.mjs', 'javascript'],
      ['lib.cjs', 'javascript'],
      ['lib.mts', 'typescript'],
      ['lib.cts', 'typescript'],
      ['build.gradle.kts', 'kotlin'],
      ['main.c', 'c'],
      ['stdio.h', 'c'],
      ['main.cpp', 'cpp'],
      ['main.cc', 'cpp'],
      ['main.cxx', 'cpp'],
      ['vector.hpp', 'cpp'],
      ['map.hh', 'cpp'],
      ['algo.hxx', 'cpp'],
      ['Program.cs', 'csharp'],
      ['Main.hs', 'haskell'],
      ['Literate.lhs', 'haskell'],
      ['Program.fs', 'fsharp'],
      ['Script.fsi', 'fsharp'],
      ['Script.fsx', 'fsharp'],
      ['core.clj', 'clojure'],
      ['app.cljs', 'clojure'],
      ['shared.cljc', 'clojure'],
      ['Main.elm', 'elm'],
      ['Main.purs', 'purescript'],
      ['init.el', 'emacs-lisp'],
      ['Main.lean', 'lean'],
      ['main.hcl', 'hcl'],
      ['main.tf', 'terraform'],
      ['vars.tfvars', 'terraform'],
      ['config.nix', 'nix'],
      ['script.bat', 'bat'],
      ['script.cmd', 'bat'],
      ['script.ps1', 'powershell'],
      ['module.psm1', 'powershell'],
      ['data.psd1', 'powershell'],
      ['config.ini', 'ini'],
      ['utils.cmake', 'cmake'],
      ['layout.xml', 'xml'],
      ['transform.xsl', 'xml'],
      ['schema.xsd', 'xml'],
      ['icon.svg', 'xml'],
      ['Info.plist', 'xml'],
      ['message.proto', 'protobuf'],
      ['query.sql', 'sql'],
      ['setup.reg', 'reg'],
      ['main.bicep', 'bicep'],
      ['app.scss', 'scss'],
      ['app.sass', 'sass'],
      ['app.less', 'less'],
      ['App.svelte', 'svelte'],
      ['Layout.astro', 'astro'],
      ['index.pug', 'pug'],
      ['index.jade', 'pug'],
      ['view.haml', 'haml'],
      ['template.hbs', 'handlebars'],
      ['index.erb', 'erb'],
      ['post.mdx', 'mdx'],
      ['schema.graphql', 'graphql'],
      ['schema.gql', 'graphql'],
      ['schema.prisma', 'prisma'],
      ['page.liquid', 'liquid'],
      ['base.twig', 'twig'],
      ['Page.razor', 'razor'],
      ['app.coffee', 'coffeescript'],
      ['data.csv', 'csv'],
      ['data.tsv', 'tsv'],
      ['settings.jsonc', 'jsonc'],
      ['config.json5', 'json5'],
      ['data.jsonl', 'jsonl'],
      ['config.hjson', 'hjson'],
      ['readme.rst', 'rst'],
      ['readme.adoc', 'asciidoc'],
      ['paper.tex', 'latex'],
      ['refs.bib', 'bibtex'],
      ['changes.diff', 'diff'],
      ['fix.patch', 'diff'],
      ['main.zig', 'zig'],
      ['main.d', 'd'],
      ['Token.sol', 'solidity'],
      ['Form.vb', 'vb'],
      ['cpu.vhd', 'vhdl'],
      ['cpu.vhdl', 'vhdl'],
      ['bus.sv', 'system-verilog'],
      ['main.gleam', 'gleam'],
      ['main.odin', 'odin'],
      ['main.ada', 'ada'],
      ['main.adb', 'ada'],
      ['main.ads', 'ada'],
      ['main.pas', 'pascal'],
      ['script.p6', 'perl6'],
      ['script.raku', 'perl6'],
      ['main.cob', 'cobol'],
      ['main.cobol', 'cobol'],
      ['main.f90', 'fortran-free-form'],
      ['main.f95', 'fortran-free-form'],
      ['main.f03', 'fortran-free-form'],
      ['main.f08', 'fortran-free-form'],
      ['player.gd', 'gdscript'],
      ['init.vim', 'viml'],
      ['model.scad', 'openscad'],
      ['doc.typ', 'typst'],
      ['shader.wgsl', 'wgsl'],
      ['shader.glsl', 'glsl'],
      ['shader.hlsl', 'hlsl'],
      ['main.mojo', 'mojo'],
      ['config.pkl', 'pkl'],
      ['scene.ron', 'ron'],
      ['config.kdl', 'kdl'],
      ['schema.cue', 'cue'],
      ['math.wl', 'wolfram'],
      ['app.vala', 'vala'],
      ['module.move', 'move'],
      ['script.luau', 'luau'],
      ['main.qml', 'qml'],
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
      ['Dockerfile', 'dockerfile'],
      ['path/to/Dockerfile', 'dockerfile'],
      ['Justfile', 'just'],
      ['justfile', 'just'],
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
