import { describe, expect, it } from 'vitest'
import type { DiffFileSummary, DiffHunk } from '../domain/diff.js'
import type { DiffRange } from '../domain/diff-range.js'
import type { DiffParser, ParsedDiffFile } from '../domain/ports/diff-parser.js'
import type { GitDiffClient } from '../domain/ports/git-diff-client.js'
import { createDiffService } from './diff-service.js'

function createFakeGit(
  summary: ReadonlyArray<DiffFileSummary>,
  patchByPath: Readonly<Record<string, string>>,
): GitDiffClient {
  return {
    diffSummary: () => Promise.resolve(summary),
    diffFile: (_range: DiffRange, path: string) => {
      return Promise.resolve(patchByPath[path] ?? '')
    },
  }
}

function createFakeParser(parsed: ReadonlyArray<ParsedDiffFile>): DiffParser {
  return () => parsed
}

const RANGE: DiffRange = { kind: 'working-vs-head' }

const SAMPLE_HUNK: DiffHunk = {
  oldStart: 1,
  oldLines: 3,
  newStart: 1,
  newLines: 3,
  header: '',
  lines: [
    { kind: 'context', content: 'a', oldLineNo: 1, newLineNo: 1 },
    { kind: 'delete', content: 'b', oldLineNo: 2, newLineNo: null },
    { kind: 'add', content: 'B', oldLineNo: null, newLineNo: 2 },
    { kind: 'context', content: 'c', oldLineNo: 3, newLineNo: 3 },
  ],
}

describe('DiffService.getDiffFileList', () => {
  it('GitDiffClientのdiffSummary結果をそのまま返す', async () => {
    const summary: ReadonlyArray<DiffFileSummary> = [
      {
        path: 'foo.ts',
        oldPath: null,
        status: 'modified',
        additions: 1,
        deletions: 1,
        binary: false,
      },
    ]
    const git = createFakeGit(summary, {})
    const service = createDiffService(git, createFakeParser([]))

    const result = await service.getDiffFileList(RANGE)

    expect(result).toEqual(summary)
  })
})

describe('DiffService.getDiffFile', () => {
  it('patchが空文字列ならnullを返す', async () => {
    const git = createFakeGit([], { 'foo.ts': '' })
    const service = createDiffService(git, createFakeParser([]))

    const result = await service.getDiffFile(RANGE, 'foo.ts')

    expect(result).toBeNull()
  })

  it('parser が空配列を返したら null を返す (rename only / binary 扱い)', async () => {
    const git = createFakeGit([], { 'foo.ts': 'non-empty-patch' })
    const service = createDiffService(git, createFakeParser([]))

    const result = await service.getDiffFile(RANGE, 'foo.ts')

    expect(result).toBeNull()
  })

  it('通常の変更は additions / deletions を hunks から計算する', async () => {
    const git = createFakeGit([], { 'foo.ts': 'patch' })
    const parsed: ParsedDiffFile = {
      oldPath: 'foo.ts',
      newPath: 'foo.ts',
      hunks: [SAMPLE_HUNK],
    }
    const service = createDiffService(git, createFakeParser([parsed]))

    const result = await service.getDiffFile(RANGE, 'foo.ts')

    expect(result).not.toBeNull()
    if (result === null) throw new Error('expected non-null')
    expect(result.path).toBe('foo.ts')
    expect(result.oldPath).toBeNull()
    expect(result.status).toBe('modified')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
    expect(result.binary).toBe(false)
    expect(result.language).toBe('typescript')
    expect(result.hunks).toHaveLength(1)
  })

  it('added ファイルは status: added、language は拡張子から推定', async () => {
    const git = createFakeGit([], { 'new.py': 'patch' })
    const parsed: ParsedDiffFile = {
      oldPath: null,
      newPath: 'new.py',
      hunks: [
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          header: '',
          lines: [{ kind: 'add', content: 'x = 1', oldLineNo: null, newLineNo: 1 }],
        },
      ],
    }
    const service = createDiffService(git, createFakeParser([parsed]))

    const result = await service.getDiffFile(RANGE, 'new.py')

    expect(result?.status).toBe('added')
    expect(result?.language).toBe('python')
    expect(result?.additions).toBe(1)
    expect(result?.deletions).toBe(0)
  })

  it('deleted ファイルは status: deleted', async () => {
    const git = createFakeGit([], { 'gone.ts': 'patch' })
    const parsed: ParsedDiffFile = {
      oldPath: 'gone.ts',
      newPath: null,
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 0,
          header: '',
          lines: [{ kind: 'delete', content: 'x = 1', oldLineNo: 1, newLineNo: null }],
        },
      ],
    }
    const service = createDiffService(git, createFakeParser([parsed]))

    const result = await service.getDiffFile(RANGE, 'gone.ts')

    expect(result?.status).toBe('deleted')
    expect(result?.additions).toBe(0)
    expect(result?.deletions).toBe(1)
  })

  it('parser が両 path null を返した場合は fallbackPath を採用する', async () => {
    const git = createFakeGit([], { 'fallback.ts': 'patch' })
    const parsed: ParsedDiffFile = {
      oldPath: null,
      newPath: null,
      hunks: [SAMPLE_HUNK],
    }
    const service = createDiffService(git, createFakeParser([parsed]))

    const result = await service.getDiffFile(RANGE, 'fallback.ts')

    expect(result?.path).toBe('fallback.ts')
  })
})
