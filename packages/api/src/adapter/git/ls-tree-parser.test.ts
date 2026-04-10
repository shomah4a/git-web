import { describe, expect, it } from 'vitest'
import { parseLsTreeZ } from './ls-tree-parser.js'

describe('parseLsTreeZ', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseLsTreeZ('', '')).toEqual([])
  })

  it('ルート直下の blob エントリをパースできる', () => {
    const input = '100644 blob abc1234    1234\tREADME.md\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      {
        name: 'README.md',
        path: 'README.md',
        type: 'blob',
        status: null,
        mode: '100644',
        size: 1234,
      },
    ])
  })

  it('ルート直下の tree エントリをパースできる', () => {
    const input = '040000 tree def5678       -\tsrc\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      { name: 'src', path: 'src', type: 'tree', status: null, mode: '040000', size: null },
    ])
  })

  it('複数エントリをパースできる', () => {
    const input =
      '040000 tree aaa0001       -\tsrc\0' +
      '100644 blob bbb0002     567\tpackage.json\0' +
      '100644 blob ccc0003      42\tREADME.md\0'

    const result = parseLsTreeZ(input, '')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      name: 'src',
      path: 'src',
      type: 'tree',
      status: null,
      mode: '040000',
      size: null,
    })
    expect(result[1]).toEqual({
      name: 'package.json',
      path: 'package.json',
      type: 'blob',
      status: null,
      mode: '100644',
      size: 567,
    })
    expect(result[2]).toEqual({
      name: 'README.md',
      path: 'README.md',
      type: 'blob',
      status: null,
      mode: '100644',
      size: 42,
    })
  })

  it('basePath が指定されている場合はパスに前置される', () => {
    const input = '100644 blob abc1234    1234\tindex.ts\0'

    expect(parseLsTreeZ(input, 'src')).toEqual([
      {
        name: 'index.ts',
        path: 'src/index.ts',
        type: 'blob',
        status: null,
        mode: '100644',
        size: 1234,
      },
    ])
  })

  it('ネストしたパスの name は最後のセグメントになる', () => {
    const input = '100644 blob abc1234    5678\tcomponents/DiffView.vue\0'

    expect(parseLsTreeZ(input, 'src')).toEqual([
      {
        name: 'DiffView.vue',
        path: 'src/components/DiffView.vue',
        type: 'blob',
        status: null,
        mode: '100644',
        size: 5678,
      },
    ])
  })

  it('commit タイプ (submodule) は無視される', () => {
    const input = '160000 commit abc1234       -\tvendor/lib\0'

    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('タブを含まないレコードは無視される', () => {
    const input = 'malformed record\0'

    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('ヘッダーのパーツが不足しているレコードは無視される', () => {
    const input = '100644 blob\tfile.txt\0'

    expect(parseLsTreeZ(input, '')).toEqual([])
  })

  it('日本語ファイル名をパースできる', () => {
    const input = '100644 blob abc1234    2048\tドキュメント/設計書.md\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      {
        name: '設計書.md',
        path: 'ドキュメント/設計書.md',
        type: 'blob',
        status: null,
        mode: '100644',
        size: 2048,
      },
    ])
  })

  it('size のスペースパディングが正しく処理される', () => {
    const input = '100644 blob abc1234       0\tempty.txt\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      { name: 'empty.txt', path: 'empty.txt', type: 'blob', status: null, mode: '100644', size: 0 },
    ])
  })

  it('実行可能ファイルの mode がパースできる', () => {
    const input = '100755 blob abc1234     512\tscript.sh\0'

    expect(parseLsTreeZ(input, '')).toEqual([
      {
        name: 'script.sh',
        path: 'script.sh',
        type: 'blob',
        status: null,
        mode: '100755',
        size: 512,
      },
    ])
  })
})
