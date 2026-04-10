import { describe, expect, it } from 'vitest'
import type { TreeEntryStatus } from '../../domain/tree.js'
import { extractOneLevel } from './ls-files-parser.js'

describe('extractOneLevel', () => {
  const emptyStatus: ReadonlyMap<string, TreeEntryStatus> = new Map()

  it('空文字列は空配列を返す', () => {
    expect(extractOneLevel('', '', emptyStatus)).toEqual([])
  })

  it('ルート直下のファイルを抽出できる', () => {
    const input = 'README.md\0package.json\0'
    const result = extractOneLevel(input, '', emptyStatus)
    expect(result).toEqual([
      { name: 'README.md', path: 'README.md', type: 'blob', status: null, mode: null, size: null },
      {
        name: 'package.json',
        path: 'package.json',
        type: 'blob',
        status: null,
        mode: null,
        size: null,
      },
    ])
  })

  it('サブディレクトリをtreeエントリとして抽出する', () => {
    const input = 'src/main.ts\0src/utils.ts\0README.md\0'
    const result = extractOneLevel(input, '', emptyStatus)
    expect(result).toEqual([
      { name: 'src', path: 'src', type: 'tree', status: null, mode: null, size: null },
      { name: 'README.md', path: 'README.md', type: 'blob', status: null, mode: null, size: null },
    ])
  })

  it('サブディレクトリは重複排除される', () => {
    const input = 'src/a.ts\0src/b.ts\0src/c/d.ts\0'
    const result = extractOneLevel(input, '', emptyStatus)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'src',
      path: 'src',
      type: 'tree',
      status: null,
      mode: null,
      size: null,
    })
  })

  it('basePath指定で配下の1階層分を抽出する', () => {
    const input = 'src/main.ts\0src/components/Foo.vue\0src/components/Bar.vue\0'
    const result = extractOneLevel(input, 'src', emptyStatus)
    expect(result).toEqual([
      { name: 'main.ts', path: 'src/main.ts', type: 'blob', status: null, mode: null, size: null },
      {
        name: 'components',
        path: 'src/components',
        type: 'tree',
        status: null,
        mode: null,
        size: null,
      },
    ])
  })

  it('basePath配下にないパスはスキップされる', () => {
    const input = 'docs/adr/001.md\0src/main.ts\0'
    const result = extractOneLevel(input, 'src', emptyStatus)
    expect(result).toEqual([
      { name: 'main.ts', path: 'src/main.ts', type: 'blob', status: null, mode: null, size: null },
    ])
  })

  it('statusMapからファイルのステータスを反映する', () => {
    const input = 'README.md\0src/main.ts\0new.txt\0'
    const statusMap = new Map<string, TreeEntryStatus>([
      ['src/main.ts', 'modified'],
      ['new.txt', 'untracked'],
    ])
    const result = extractOneLevel(input, '', statusMap)
    expect(result).toEqual([
      { name: 'README.md', path: 'README.md', type: 'blob', status: null, mode: null, size: null },
      { name: 'src', path: 'src', type: 'tree', status: null, mode: null, size: null },
      {
        name: 'new.txt',
        path: 'new.txt',
        type: 'blob',
        status: 'untracked',
        mode: null,
        size: null,
      },
    ])
  })
})
