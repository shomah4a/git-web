import { describe, expect, it } from 'vitest'
import type { WorktreeEntryStatus } from '../../domain/worktree-entry.js'
import { extractWorktreeOneLevel } from './worktree-entry-parser.js'

describe('extractWorktreeOneLevel', () => {
  const emptyStatus: ReadonlyMap<string, WorktreeEntryStatus> = new Map()
  const emptyMode: ReadonlyMap<string, string> = new Map()
  const emptySize: ReadonlyMap<string, number> = new Map()

  it('空文字列は空配列を返す', () => {
    expect(extractWorktreeOneLevel('', '', emptyStatus, emptyMode, emptySize)).toEqual([])
  })

  it('ルート直下のファイルをmode付きで抽出できる', () => {
    const input = 'README.md\0package.json\0'
    const modeMap = new Map([
      ['README.md', '100644'],
      ['package.json', '100644'],
    ])
    const sizeMap = new Map([
      ['README.md', 1024],
      ['package.json', 512],
    ])
    const result = extractWorktreeOneLevel(input, '', emptyStatus, modeMap, sizeMap)
    expect(result).toEqual([
      {
        status: null,
        name: 'README.md',
        path: 'README.md',
        type: 'blob',
        mode: '100644',
        size: 1024,
      },
      {
        status: null,
        name: 'package.json',
        path: 'package.json',
        type: 'blob',
        mode: '100644',
        size: 512,
      },
    ])
  })

  it('ディレクトリはmode/sizeがnullになる', () => {
    const input = 'src/main.ts\0'
    const result = extractWorktreeOneLevel(input, '', emptyStatus, emptyMode, emptySize)
    expect(result).toEqual([
      { status: null, name: 'src', path: 'src', type: 'tree', mode: null, size: null },
    ])
  })

  it('statusMapからステータスを反映する', () => {
    const input = 'README.md\0new.txt\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['new.txt', 'untracked']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result[0]?.status).toBeNull()
    expect(result[1]?.status).toBe('untracked')
  })

  it('modeMapにないファイルのmodeはnullになる', () => {
    const input = 'untracked.txt\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['untracked.txt', 'untracked']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result[0]?.mode).toBeNull()
  })

  it('sizeMapにないファイルのsizeはnullになる', () => {
    const input = 'deleted.txt\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['deleted.txt', 'deleted']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result[0]?.size).toBeNull()
  })

  it('basePath指定で配下の1階層分を抽出する', () => {
    const input = 'src/main.ts\0src/components/Foo.vue\0'
    const modeMap = new Map([['src/main.ts', '100644']])
    const sizeMap = new Map([['src/main.ts', 256]])
    const result = extractWorktreeOneLevel(input, 'src', emptyStatus, modeMap, sizeMap)
    expect(result).toEqual([
      {
        status: null,
        name: 'main.ts',
        path: 'src/main.ts',
        type: 'blob',
        mode: '100644',
        size: 256,
      },
      {
        status: null,
        name: 'components',
        path: 'src/components',
        type: 'tree',
        mode: null,
        size: null,
      },
    ])
  })

  it('実行可能ファイルのmodeを正しく反映する', () => {
    const input = 'bin/run.sh\0'
    const modeMap = new Map([['bin/run.sh', '100755']])
    const sizeMap = new Map([['bin/run.sh', 128]])
    const result = extractWorktreeOneLevel(input, 'bin', emptyStatus, modeMap, sizeMap)
    expect(result).toEqual([
      { status: null, name: 'run.sh', path: 'bin/run.sh', type: 'blob', mode: '100755', size: 128 },
    ])
  })

  it('配下に変更ファイルがあるディレクトリのstatusがmodifiedになる', () => {
    const input = 'src/main.ts\0src/utils.ts\0README.md\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['src/main.ts', 'modified']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result).toEqual([
      { status: 'modified', name: 'src', path: 'src', type: 'tree', mode: null, size: null },
      { status: null, name: 'README.md', path: 'README.md', type: 'blob', mode: null, size: null },
    ])
  })

  it('配下にuntrackedファイルがあるディレクトリのstatusもmodifiedになる', () => {
    const input = 'lib/new-file.ts\0lib/index.ts\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['lib/new-file.ts', 'untracked']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result).toEqual([
      { status: 'modified', name: 'lib', path: 'lib', type: 'tree', mode: null, size: null },
    ])
  })

  it('配下に変更ファイルがないディレクトリのstatusはnullのまま', () => {
    const input = 'src/main.ts\0lib/index.ts\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['src/main.ts', 'modified']])
    const result = extractWorktreeOneLevel(input, '', statusMap, emptyMode, emptySize)
    expect(result[0]?.status).toBe('modified') // src
    expect(result[1]?.status).toBeNull() // lib
  })

  it('basePath指定時も配下の変更を正しく集約する', () => {
    const input = 'src/components/Foo.vue\0src/components/Bar.vue\0src/utils/helper.ts\0'
    const statusMap = new Map<string, WorktreeEntryStatus>([['src/components/Foo.vue', 'modified']])
    const result = extractWorktreeOneLevel(input, 'src', statusMap, emptyMode, emptySize)
    expect(result).toEqual([
      {
        status: 'modified',
        name: 'components',
        path: 'src/components',
        type: 'tree',
        mode: null,
        size: null,
      },
      { status: null, name: 'utils', path: 'src/utils', type: 'tree', mode: null, size: null },
    ])
  })
})
