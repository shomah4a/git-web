import { describe, expect, it } from 'vitest'
import { parseLsTreeZ } from './ls-tree-parser.js'

describe('parseLsTreeZ', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseLsTreeZ('', '')).toEqual([])
  })

  it('ルート直下の blob エントリをパースできる', () => {
    const input = '100644 blob abc1234\tREADME.md\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      { name: 'README.md', path: 'README.md', type: 'blob' },
    ])
  })

  it('ルート直下の tree エントリをパースできる', () => {
    const input = '040000 tree def5678\tsrc\0'

    expect(parseLsTreeZ(input, '')).toEqual([{ name: 'src', path: 'src', type: 'tree' }])
  })

  it('複数エントリをパースできる', () => {
    const input =
      '040000 tree aaa0001\tsrc\0' +
      '100644 blob bbb0002\tpackage.json\0' +
      '100644 blob ccc0003\tREADME.md\0'

    const result = parseLsTreeZ(input, '')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ name: 'src', path: 'src', type: 'tree' })
    expect(result[1]).toEqual({ name: 'package.json', path: 'package.json', type: 'blob' })
    expect(result[2]).toEqual({ name: 'README.md', path: 'README.md', type: 'blob' })
  })

  it('basePath が指定されている場合はパスに前置される', () => {
    const input = '100644 blob abc1234\tindex.ts\0'

    expect(parseLsTreeZ(input, 'src')).toEqual([
      { name: 'index.ts', path: 'src/index.ts', type: 'blob' },
    ])
  })

  it('ネストしたパスの name は最後のセグメントになる', () => {
    // ls-tree が返すパスはリビジョンツリー内の相対パスだが、
    // basePath なしで components/DiffView.vue のようなパスが来た場合
    const input = '100644 blob abc1234\tcomponents/DiffView.vue\0'

    expect(parseLsTreeZ(input, 'src')).toEqual([
      { name: 'DiffView.vue', path: 'src/components/DiffView.vue', type: 'blob' },
    ])
  })

  it('commit タイプ (submodule) は無視される', () => {
    const input = '160000 commit abc1234\tvendor/lib\0'

    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('タブを含まないレコードは無視される', () => {
    const input = 'malformed record\0'

    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('ヘッダーのパーツが不足しているレコードは無視される', () => {
    const input = '100644 blob\tfile.txt\0'

    // "100644 blob" は parts.length === 2 なので < 3 で null
    // しかし実際は "100644" と "blob" の 2 パーツでタブ前にハッシュがない
    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('日本語ファイル名をパースできる', () => {
    const input = '100644 blob abc1234\tドキュメント/設計書.md\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      { name: '設計書.md', path: 'ドキュメント/設計書.md', type: 'blob' },
    ])
  })
})
