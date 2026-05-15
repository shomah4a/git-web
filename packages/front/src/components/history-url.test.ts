import { describe, expect, it } from 'vitest'
import { buildHistoryUrl } from './history-url.js'

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
