import { describe, expect, it } from 'vitest'
import { createStaticHandler } from './static.js'

describe('createStaticHandler', () => {
  it('スタブ実装として常に404を返す', async () => {
    const handler = createStaticHandler()

    const response = await handler({ method: 'GET', url: '/index.html' })

    expect(response.status).toBe(404)
    expect(response.body).toBe('static assets not available yet')
  })
})
