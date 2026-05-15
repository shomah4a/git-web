import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInsideRepo } from './is-inside-repo.js'

describe('isInsideRepo', () => {
  const root = `${sep}home${sep}user${sep}repo`

  describe('true を返すケース', () => {
    it('root と完全一致する', () => {
      expect(isInsideRepo(root, root)).toBe(true)
    })

    it('root 直下のファイルを指す', () => {
      expect(isInsideRepo(root, `${root}${sep}README.md`)).toBe(true)
    })

    it('root 直下のサブディレクトリを指す', () => {
      expect(isInsideRepo(root, `${root}${sep}src`)).toBe(true)
    })

    it('深い階層のファイルを指す', () => {
      expect(isInsideRepo(root, `${root}${sep}src${sep}a${sep}b.ts`)).toBe(true)
    })
  })

  describe('false を返すケース', () => {
    it('親ディレクトリを指す', () => {
      expect(isInsideRepo(root, `${sep}home${sep}user`)).toBe(false)
    })

    it('無関係な絶対パスを指す', () => {
      expect(isInsideRepo(root, `${sep}etc${sep}passwd`)).toBe(false)
    })

    it('root と prefix が一致する兄弟ディレクトリを指す (sep 境界チェック)', () => {
      expect(isInsideRepo(root, `${root}-sibling${sep}a.ts`)).toBe(false)
      expect(isInsideRepo(root, `${root}_backup`)).toBe(false)
    })

    it('root に末尾文字だけ余計に付いたパスを指す', () => {
      expect(isInsideRepo(root, `${root}x`)).toBe(false)
    })
  })

  describe('正規化 (ADR 0055 §7-6)', () => {
    it('root の末尾 sep があっても判定が安定する', () => {
      expect(isInsideRepo(`${root}${sep}`, `${root}${sep}README.md`)).toBe(true)
    })

    it('target の末尾 sep があっても判定が安定する', () => {
      expect(isInsideRepo(root, `${root}${sep}src${sep}`)).toBe(true)
    })

    it('重複 sep を含む root / target を正規化する', () => {
      expect(isInsideRepo(`${root}${sep}${sep}`, `${root}${sep}${sep}README.md`)).toBe(true)
    })

    it('`.` segment を含む target を正規化する', () => {
      expect(isInsideRepo(root, `${root}${sep}.${sep}README.md`)).toBe(true)
    })

    it('正規化前は兄弟に見えるが正規化後も依然として兄弟', () => {
      expect(isInsideRepo(`${root}${sep}`, `${root}-sibling${sep}a.ts`)).toBe(false)
    })
  })
})
