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
  defaultBranch: 'main',
  branches: ['main', 'feature/a'],
  tags: ['v1.0.0'],
}

describe('createRefsHandler', () => {
  it('既定値で呼び出すと_service_に_q_空文字列が渡る', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await handler({ method: 'GET', url: '/api/refs' })

    expect(service.calls).toEqual([{ q: '' }])
  })

  it('q_クエリが渡ると_service_に反映される', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await handler({ method: 'GET', url: '/api/refs?q=feat' })

    expect(service.calls).toEqual([{ q: 'feat' }])
  })

  it('RefListDto_形式の_JSON_を返す', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    expect(response.status).toBe(200)
    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      defaultBranch: 'main',
      branches: ['main', 'feature/a'],
      tags: ['v1.0.0'],
    })
  })

  it('defaultBranch_が_null_でもそのまま返す', async () => {
    const service = createFakeService({
      defaultBranch: null,
      branches: [],
      tags: [],
    })
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    if (typeof response.body !== 'string') throw new Error('expected string body')
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      defaultBranch: null,
      branches: [],
      tags: [],
    })
  })

  it('Content-Type_と_Cache-Control_ヘッダが付く', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    const response = await handler({ method: 'GET', url: '/api/refs' })

    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers?.['cache-control']).toBe('no-store')
  })

  it('制御文字を含む_q_は_InvalidRefsQueryError_を伝播する', async () => {
    const service = createFakeService(SAMPLE_REFS)
    const handler = createRefsHandler(service)

    await expect(handler({ method: 'GET', url: '/api/refs?q=%00' })).rejects.toBeInstanceOf(
      InvalidRefsQueryError,
    )
  })
})
