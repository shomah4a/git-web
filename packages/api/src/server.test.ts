import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import type { Route } from './router.js'
import { close, createApiServer, listen } from './server.js'

let server: Server
let baseUrl: string

beforeEach(() => {
  server = createApiServer({ routes: [] })
})

afterEach(async () => {
  await close(server)
})

async function start(routes: ReadonlyArray<Route>): Promise<void> {
  server = createApiServer({ routes })
  const addr = await listen(server, '127.0.0.1', 0)
  baseUrl = `http://${addr.host}:${addr.port.toString()}`
}

describe('createApiServer', () => {
  it('登録したルートにリクエストが届くとハンドラのレスポンスを返す', async () => {
    await start([
      {
        method: 'GET',
        path: '/hello',
        handler: () => ({
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: 'hi',
        }),
      },
    ])

    const response = await fetch(`${baseUrl}/hello`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hi')
  })

  it('未登録のパスに対しては404を返す', async () => {
    await start([])

    const response = await fetch(`${baseUrl}/missing`)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')
  })

  it('メソッドが一致しないリクエストには404を返す', async () => {
    await start([
      {
        method: 'GET',
        path: '/only-get',
        handler: () => ({ status: 200, body: 'ok' }),
      },
    ])

    const response = await fetch(`${baseUrl}/only-get`, { method: 'POST' })

    expect(response.status).toBe(404)
  })

  it('ハンドラが例外を投げた場合は500を返す', async () => {
    await start([
      {
        method: 'GET',
        path: '/boom',
        handler: () => {
          throw new Error('boom')
        },
      },
    ])

    const response = await fetch(`${baseUrl}/boom`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('internal error')
  })

  it('非同期ハンドラがrejectした場合も500を返す', async () => {
    await start([
      {
        method: 'GET',
        path: '/async-boom',
        handler: () => Promise.reject(new Error('async boom')),
      },
    ])

    const response = await fetch(`${baseUrl}/async-boom`)

    expect(response.status).toBe(500)
  })

  it('クエリ文字列はパスマッチング対象から除外される', async () => {
    await start([
      {
        method: 'GET',
        path: '/api/repo',
        handler: () => ({ status: 200, body: 'matched' }),
      },
    ])

    const response = await fetch(`${baseUrl}/api/repo?foo=bar`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('matched')
  })
})

describe('listen関数', () => {
  it('port 0指定で空きポートが割り当てられる', async () => {
    await start([])

    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('同じアドレスで二重リッスンするとエラーになる', async () => {
    await start([])
    const addr = new URL(baseUrl)
    const port = Number(addr.port)

    const second = createApiServer({ routes: [] })
    try {
      await expect(listen(second, '127.0.0.1', port)).rejects.toThrow()
    } finally {
      // second は listen 失敗で close 不要だが、念のため握りつぶす
      second.close(() => {})
    }
  })
})
