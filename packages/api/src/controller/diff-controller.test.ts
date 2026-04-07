import { describe, expect, it } from 'vitest'
import type { DiffFile, DiffFileSummary } from '../domain/diff.js'
import type { DiffRange } from '../domain/diff-range.js'
import {
  InvalidDiffPathError,
  InvalidDiffRangeError,
  InvalidRevisionError,
} from '../domain/errors.js'
import type { DiffService } from '../service/diff-service.js'
import { createDiffFileHandler, createDiffFilesHandler } from './diff-controller.js'

function createFakeService(
  summary: ReadonlyArray<DiffFileSummary>,
  fileByPath: Readonly<Record<string, DiffFile | null>>,
): DiffService & { calls: Array<{ method: string; range: DiffRange; path?: string }> } {
  const calls: Array<{ method: string; range: DiffRange; path?: string }> = []
  return {
    calls,
    getDiffFileList(range) {
      calls.push({ method: 'list', range })
      return Promise.resolve(summary)
    },
    getDiffFile(range, path) {
      calls.push({ method: 'file', range, path })
      return Promise.resolve(fileByPath[path] ?? null)
    },
  }
}

const SAMPLE_SUMMARY: ReadonlyArray<DiffFileSummary> = [
  {
    path: 'foo.ts',
    oldPath: null,
    status: 'modified',
    additions: 2,
    deletions: 1,
    binary: false,
  },
]

const SAMPLE_FILE: DiffFile = {
  path: 'foo.ts',
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  language: 'typescript',
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      header: '',
      lines: [
        { kind: 'delete', content: 'old', oldLineNo: 1, newLineNo: null },
        { kind: 'add', content: 'new', oldLineNo: null, newLineNo: 1 },
      ],
    },
  ],
}

describe('createDiffFilesHandler', () => {
  it('引数なしのリクエストは working-vs-head range で service を呼ぶ', async () => {
    const service = createFakeService(SAMPLE_SUMMARY, {})
    const handler = createDiffFilesHandler(service)

    const response = await handler({ method: 'GET', url: '/api/diff/files' })

    expect(response.status).toBe(200)
    expect(service.calls[0]?.range).toEqual({ kind: 'working-vs-head' })
  })

  it('from クエリのみで working-vs-rev range で service を呼ぶ', async () => {
    const service = createFakeService(SAMPLE_SUMMARY, {})
    const handler = createDiffFilesHandler(service)

    await handler({ method: 'GET', url: '/api/diff/files?from=HEAD~1' })

    const range = service.calls[0]?.range
    expect(range?.kind).toBe('working-vs-rev')
  })

  it('from と to 両方で rev-vs-rev range で service を呼ぶ', async () => {
    const service = createFakeService(SAMPLE_SUMMARY, {})
    const handler = createDiffFilesHandler(service)

    await handler({ method: 'GET', url: '/api/diff/files?from=HEAD~2&to=HEAD' })

    const range = service.calls[0]?.range
    expect(range?.kind).toBe('rev-vs-rev')
  })

  it('ボディは files 配列を含む DiffFilesResponseDto 形式', async () => {
    const service = createFakeService(SAMPLE_SUMMARY, {})
    const handler = createDiffFilesHandler(service)

    const response = await handler({ method: 'GET', url: '/api/diff/files' })

    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      files: [
        {
          path: 'foo.ts',
          oldPath: null,
          status: 'modified',
          additions: 2,
          deletions: 1,
          binary: false,
        },
      ],
    })
  })

  it('Content-Type と Cache-Control ヘッダが付く', async () => {
    const service = createFakeService(SAMPLE_SUMMARY, {})
    const handler = createDiffFilesHandler(service)

    const response = await handler({ method: 'GET', url: '/api/diff/files' })

    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers?.['cache-control']).toBe('no-store')
  })

  it('不正なリビジョンは InvalidRevisionError を伝播する', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFilesHandler(service)

    await expect(
      handler({ method: 'GET', url: '/api/diff/files?from=main' }),
    ).rejects.toBeInstanceOf(InvalidRevisionError)
  })

  it('to だけ指定は InvalidDiffRangeError を伝播する', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFilesHandler(service)

    await expect(handler({ method: 'GET', url: '/api/diff/files?to=HEAD' })).rejects.toBeInstanceOf(
      InvalidDiffRangeError,
    )
  })
})

describe('createDiffFileHandler', () => {
  it('path クエリが無いと InvalidDiffPathError を投げる', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFileHandler(service)

    await expect(handler({ method: 'GET', url: '/api/diff/file' })).rejects.toBeInstanceOf(
      InvalidDiffPathError,
    )
  })

  it('path が ".." を含むと InvalidDiffPathError', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFileHandler(service)

    await expect(
      handler({ method: 'GET', url: '/api/diff/file?path=..%2Fetc%2Fpasswd' }),
    ).rejects.toBeInstanceOf(InvalidDiffPathError)
  })

  it('service が null を返したら 404', async () => {
    const service = createFakeService([], { 'missing.ts': null })
    const handler = createDiffFileHandler(service)

    const response = await handler({ method: 'GET', url: '/api/diff/file?path=missing.ts' })

    expect(response.status).toBe(404)
  })

  it('通常ケースでは DiffFileDto をボディに含む 200 を返す', async () => {
    const service = createFakeService([], { 'foo.ts': SAMPLE_FILE })
    const handler = createDiffFileHandler(service)

    const response = await handler({ method: 'GET', url: '/api/diff/file?path=foo.ts' })

    expect(response.status).toBe(200)
    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      path: 'foo.ts',
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 1,
      binary: false,
      language: 'typescript',
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          header: '',
          lines: [
            { kind: 'delete', content: 'old', oldLineNo: 1, newLineNo: null },
            { kind: 'add', content: 'new', oldLineNo: null, newLineNo: 1 },
          ],
        },
      ],
    })
  })

  it('path の URL エンコードされたスラッシュを正しく扱う', async () => {
    const service = createFakeService([], { 'src/foo.ts': SAMPLE_FILE })
    const handler = createDiffFileHandler(service)

    const response = await handler({
      method: 'GET',
      url: '/api/diff/file?path=src%2Ffoo.ts',
    })

    expect(response.status).toBe(200)
    expect(service.calls[0]?.path).toBe('src/foo.ts')
  })

  it('path パラメータに連続スラッシュを含む入力は拒否する (M1)', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFileHandler(service)

    await expect(
      handler({ method: 'GET', url: '/api/diff/file?path=a%2F%2Fb.ts' }),
    ).rejects.toBeInstanceOf(InvalidDiffPathError)
  })

  it('path パラメータに NUL バイトを含む入力は拒否する (M1)', async () => {
    const service = createFakeService([], {})
    const handler = createDiffFileHandler(service)

    await expect(
      handler({ method: 'GET', url: '/api/diff/file?path=foo%00.ts' }),
    ).rejects.toBeInstanceOf(InvalidDiffPathError)
  })
})
