import { describe, expect, it } from 'vitest'
import { InvalidRefsQueryError } from '../domain/errors.js'
import type { RefList, RefsQuery } from '../domain/refs.js'
import type { RefsService } from '../service/refs-service.js'
import { createRefsHandler } from './refs-controller.js'

function createFakeService(refs: RefList): RefsService & { calls: Array<RefsQuery> } {
  const calls: Array<RefsQuery> = []
  return {
    calls,
    list(query) {
      calls.push(query)
      return Promise.resolve(refs)
    },
  }
}

const SAMPLE_REFS: RefList = {
  head: 'main',
  defaultBranch: 'main',
  branches: ['main', 'feature/a'],
  tags: ['v1.0.0'],
  truncated: false,
}

describe('createRefsHandler', () => {
  it('既定値で呼び出すと service に { q: "", limit: 100 } が渡る', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await handler({ method: 'GET', url: '/api/refs' })

    expect(service.calls).toEqual([{ q: '', limit: 100 }])
  })

  it('q と limit クエリが渡ると service に反映される', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await handler({ method: 'GET', url: '/api/refs?q=feat&limit=20' })

    expect(service.calls).toEqual([{ q: 'feat', limit: 20 }])
  })

  it('RefListDto 形式の JSON を返す', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    expect(response.status).toBe(200)
    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      head: 'main',
      defaultBranch: 'main',
      branches: ['main', 'feature/a'],
      tags: ['v1.0.0'],
      truncated: false,
    })
  })

  it('head が null でもそのまま返す', async () => {
    const service = createFakeService({
      head: null,
      defaultBranch: null,
      branches: [],
      tags: [],
      truncated: false,
    })
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      head: null,
      defaultBranch: null,
      branches: [],
      tags: [],
      truncated: false,
    })
  })

  it('Content-Type と Cache-Control ヘッダが付く', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers?.['cache-control']).toBe('no-store')
  })

  it('不正な limit は InvalidRefsQueryError を伝播する', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await expect(handler({ method: 'GET', url: '/api/refs?limit=abc' })).rejects.toBeInstanceOf(
      InvalidRefsQueryError,
    )
  })

  it('制御文字を含む q は InvalidRefsQueryError を伝播する', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await expect(handler({ method: 'GET', url: '/api/refs?q=%00' })).rejects.toBeInstanceOf(
      InvalidRefsQueryError,
    )
  })
})
