import { describe, expect, it } from 'vitest'
import type {
  DiffFileDto,
  DiffFileSummaryDto,
  DiffFilesResponseDto,
  DiffHunkDto,
  DiffLineDto,
} from './diff.js'

describe('diff DTO 型', () => {
  it('DiffLineDtoを構築できる', () => {
    const line: DiffLineDto = {
      kind: 'context',
      content: 'const x = 1',
      oldLineNo: 10,
      newLineNo: 10,
    }
    expect(line.kind).toBe('context')
    expect(line.content).toBe('const x = 1')
  })

  it('DiffHunkDtoにlinesを入れられる', () => {
    const hunk: DiffHunkDto = {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      header: '',
      lines: [
        { kind: 'context', content: 'a', oldLineNo: 1, newLineNo: 1 },
        { kind: 'add', content: 'b', oldLineNo: null, newLineNo: 2 },
      ],
    }
    expect(hunk.lines.length).toBe(2)
  })

  it('DiffFileSummaryDtoを構築できる', () => {
    const summary: DiffFileSummaryDto = {
      path: 'src/main.ts',
      oldPath: null,
      status: 'modified',
      additions: 3,
      deletions: 1,
      binary: false,
    }
    expect(summary.path).toBe('src/main.ts')
  })

  it('DiffFileDtoはsummary型を拡張してhunksを持つ', () => {
    const file: DiffFileDto = {
      path: 'src/main.ts',
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 0,
      binary: false,
      language: 'typescript',
      hunks: [],
    }
    expect(file.language).toBe('typescript')
    expect(file.hunks).toEqual([])
  })

  it('DiffFilesResponseDtoにfiles配列を入れられる', () => {
    const response: DiffFilesResponseDto = {
      files: [
        {
          path: 'a.ts',
          oldPath: null,
          status: 'added',
          additions: 1,
          deletions: 0,
          binary: false,
        },
      ],
    }
    expect(response.files.length).toBe(1)
  })
})
