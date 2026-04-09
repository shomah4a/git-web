import { describe, expect, it } from 'vitest'
import { parseDiffPath } from './diff-path.js'
import { InvalidDiffPathError } from './errors.js'

describe('parseDiffPath', () => {
  describe('許可される形式', () => {
    const accepted: ReadonlyArray<string> = [
      'foo.ts',
      'src/main.ts',
      'packages/api/src/main.ts',
      'a/b/c/d.ts',
      '-foo.ts', // "-" プレフィックスは許可 (CLI では -- 区切りで扱う)
      'file.name.with.dots.ts',
      'file with space.ts',
      'ファイル.ts', // 日本語
      // ADR 0016: segment ベース検査により正規ファイル名中の ".." は許可する
      'foo..bar',
      '..foo',
      'foo..',
      'a..b/c.ts',
      'Dockerfile.node..alpine',
    ]

    for (const input of accepted) {
      it(`${JSON.stringify(input)} を受け入れてそのまま返す`, () => {
        expect(parseDiffPath(input)).toBe(input)
      })
    }
  })

  describe('拒否される形式', () => {
    const rejected: ReadonlyArray<[string, string]> = [
      ['', 'empty path'],
      ['/abs.ts', 'absolute path'],
      ['/etc/passwd', 'absolute path'],
      ['..', 'bare parent segment'],
      ['../escape.ts', 'leading parent segment'],
      ['a/../b.ts', 'middle parent segment'],
      ['a/..', 'trailing parent segment'],
      ['a\\b.ts', 'contains backslash'],
      ['foo\u0000.ts', 'contains NUL'],
      ['foo\nbar.ts', 'contains newline (control)'],
      ['foo\tbar.ts', 'contains tab (control)'],
      ['a//b.ts', 'consecutive slashes'],
    ]

    for (const [input, desc] of rejected) {
      it(`${desc}: ${JSON.stringify(input)} は InvalidDiffPathError を投げる`, () => {
        expect(() => parseDiffPath(input)).toThrow(InvalidDiffPathError)
      })
    }

    it('4096 文字超は拒否する', () => {
      const input = 'a'.repeat(4097)

      expect(() => parseDiffPath(input)).toThrow(InvalidDiffPathError)
    })

    it('4096 文字ちょうどは許可する', () => {
      const input = 'a'.repeat(4096)

      expect(parseDiffPath(input)).toBe(input)
    })
  })

  it('エラーの reason に拒否理由が含まれる', () => {
    try {
      parseDiffPath('../foo')
      throw new Error('expected to throw')
    } catch (err) {
      if (!(err instanceof InvalidDiffPathError)) {
        throw err
      }
      expect(err.reason).toBe('contains parent segment')
      expect(err.input).toBe('../foo')
    }
  })
})
