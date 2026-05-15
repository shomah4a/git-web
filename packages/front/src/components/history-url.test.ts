import { describe, expect, it } from 'vitest'
import { buildHistoryUrl, resolveHistoryRev } from './history-url.js'

describe('buildHistoryUrl', () => {
  it('rev が null のとき rev クエリを省略する', () => {
    const url = buildHistoryUrl(null, 'src/index.ts')
    expect(url).toEqual({
      path: '/commits',
      query: { path: 'src/index.ts' },
    })
  })

  it("rev が 'HEAD' のとき rev クエリを省略する", () => {
    const url = buildHistoryUrl('HEAD', 'src/index.ts')
    expect(url).toEqual({
      path: '/commits',
      query: { path: 'src/index.ts' },
    })
  })

  it('rev が空文字のとき rev クエリを省略する', () => {
    const url = buildHistoryUrl('', 'README.md')
    expect(url).toEqual({
      path: '/commits',
      query: { path: 'README.md' },
    })
  })

  it('rev が SHA のとき rev クエリを含める', () => {
    const url = buildHistoryUrl('a83965b0e1f2c3d4', 'src/main.ts')
    expect(url).toEqual({
      path: '/commits',
      query: { rev: 'a83965b0e1f2c3d4', path: 'src/main.ts' },
    })
  })

  it('rev がブランチ名のとき rev クエリを含める', () => {
    const url = buildHistoryUrl('feat/foo', 'docs/adr/0056.md')
    expect(url).toEqual({
      path: '/commits',
      query: { rev: 'feat/foo', path: 'docs/adr/0056.md' },
    })
  })

  it('path に特殊文字を含むとき値はそのまま (encode は vue-router 任せ)', () => {
    const url = buildHistoryUrl(null, 'packages/front/src/file with space.ts')
    expect(url).toEqual({
      path: '/commits',
      query: { path: 'packages/front/src/file with space.ts' },
    })
  })
})

describe('resolveHistoryRev', () => {
  const worktrees = [
    { name: 'main', headHash: 'a83965b0' },
    { name: 'feat-x', headHash: 'b1234567' },
    { name: 'empty-wt', headHash: null },
  ]

  it('currentWt が null のとき null を返す (rev 省略)', () => {
    expect(resolveHistoryRev(null, worktrees)).toBeNull()
  })

  it('worktrees が null のとき null を返す (未解決)', () => {
    expect(resolveHistoryRev('feat-x', null)).toBeNull()
  })

  it('該当 wt が存在しないとき null を返す', () => {
    expect(resolveHistoryRev('nonexistent', worktrees)).toBeNull()
  })

  it('該当 wt の headHash が null のとき null を返す', () => {
    expect(resolveHistoryRev('empty-wt', worktrees)).toBeNull()
  })

  it('該当 wt の headHash を返す', () => {
    expect(resolveHistoryRev('feat-x', worktrees)).toBe('b1234567')
  })

  it('default worktree (main) でも currentWt=null なら null', () => {
    expect(resolveHistoryRev(null, worktrees)).toBeNull()
  })
})
