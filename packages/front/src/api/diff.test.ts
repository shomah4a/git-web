import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDiffFile, fetchDiffFiles } from './diff.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const VALID_SUMMARY = {
  path: 'foo.ts',
  oldPath: null,
  status: 'modified',
  additions: 2,
  deletions: 1,
  binary: false,
}

const VALID_FILE = {
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

/**
 * fetch のモックを差し替え、呼び出し URL を記録する。
 */
function mockFetch(responses: ReadonlyArray<Response>): Array<string> {
  const calls: string[] = []
  let idx = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString())
      const response = responses[idx]
      idx++
      if (response === undefined) {
        return Promise.reject(new Error('no more mocked response'))
      }
      return Promise.resolve(response)
    }),
  )
  return calls
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchDiffFiles', () => {
  it('from/to無しなら /api/diff/files を呼ぶ', async () => {
    const calls = mockFetch([jsonResponse(200, { files: [VALID_SUMMARY] })])

    const result = await fetchDiffFiles()

    expect(calls).toEqual(['/api/diff/files'])
    expect(result.files).toHaveLength(1)
  })

  it('from と to を URL クエリに乗せる (~はURLSearchParamsが%7Eにエンコードする)', async () => {
    const calls = mockFetch([jsonResponse(200, { files: [] })])

    await fetchDiffFiles({ from: 'HEAD~1', to: 'HEAD' })

    // URLSearchParams は "~" を "%7E" にエンコードするが、
    // サーバー側 URLSearchParams.get は自動デコードするため問題ない
    expect(calls[0]).toBe('/api/diff/files?from=HEAD%7E1&to=HEAD')
  })

  it('200以外のステータスは例外を投げる', async () => {
    mockFetch([new Response('boom', { status: 500 })])

    await expect(fetchDiffFiles()).rejects.toThrow('HTTP 500')
  })

  it('ボディが配列でないと例外を投げる', async () => {
    mockFetch([jsonResponse(200, { files: 'not-an-array' })])

    await expect(fetchDiffFiles()).rejects.toThrow('unexpected body shape')
  })

  it('files要素のフィールドが欠けていると例外を投げる', async () => {
    mockFetch([jsonResponse(200, { files: [{ path: 'foo.ts' }] })])

    await expect(fetchDiffFiles()).rejects.toThrow('unexpected body shape')
  })
})

describe('fetchDiffFile', () => {
  it('path と from/to を URL クエリに乗せる', async () => {
    const calls = mockFetch([jsonResponse(200, VALID_FILE)])

    await fetchDiffFile('src/foo.ts', { from: 'HEAD~1' })

    // URLSearchParams が "/" を "%2F" にエンコードすることを確認 (L3 対応)
    expect(calls[0]).toBe('/api/diff/file?from=HEAD%7E1&path=src%2Ffoo.ts')
  })

  it('200 の場合は DiffFileDto を返す', async () => {
    mockFetch([jsonResponse(200, VALID_FILE)])

    const result = await fetchDiffFile('foo.ts')

    expect(result).not.toBeNull()
    expect(result?.path).toBe('foo.ts')
    expect(result?.hunks).toHaveLength(1)
  })

  it('404 の場合は null を返す', async () => {
    mockFetch([new Response('not found', { status: 404 })])

    const result = await fetchDiffFile('missing.ts')

    expect(result).toBeNull()
  })

  it('400 など 404 以外のエラーは例外を投げる', async () => {
    mockFetch([new Response('bad', { status: 400 })])

    await expect(fetchDiffFile('foo.ts')).rejects.toThrow('HTTP 400')
  })

  it('hunks 以下の構造が不正だと例外を投げる', async () => {
    mockFetch([jsonResponse(200, { ...VALID_FILE, hunks: [{ oldStart: 'not-number' }] })])

    await expect(fetchDiffFile('foo.ts')).rejects.toThrow('unexpected body shape')
  })
})
