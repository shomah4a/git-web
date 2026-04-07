import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Route } from './router.js'
import { close, createApiServer, isHostAllowed, listen } from './server.js'

let server: Server
let baseUrl: string

beforeEach(() => {
  server = createApiServer({ routes: [] })
})

afterEach(async () => {
  // listen していないサーバーを close すると Server is not running で落ちるため
  // 実際に待ち受け中の場合のみ close する
  if (server.listening) {
    await close(server)
  }
})

async function start(routes: ReadonlyArray<Route>): Promise<void> {
  server = createApiServer({ routes })
  const addr = await listen(server, '127.0.0.1', 0)
  baseUrl = `http://${addr.host}:${addr.port.toString()}`
}

async function startWith(options: Parameters<typeof createApiServer>[0]): Promise<void> {
  server = createApiServer(options)
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

  describe('mapError オプション', () => {
    class SomeDomainError extends Error {
      constructor() {
        super('domain fail')
      }
    }

    it('mapError が非nullを返すとそのレスポンスを使う', async () => {
      await startWith({
        routes: [
          {
            method: 'GET',
            path: '/domain-err',
            handler: () => {
              throw new SomeDomainError()
            },
          },
        ],
        mapError: (err) =>
          err instanceof SomeDomainError
            ? {
                status: 400,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ error: 'domain', message: 'domain fail' }),
              }
            : null,
      })

      const response = await fetch(`${baseUrl}/domain-err`)

      expect(response.status).toBe(400)
      const body: unknown = await response.json()
      expect(body).toEqual({ error: 'domain', message: 'domain fail' })
    })

    it('mapError が null を返すと従来通り 500 にフォールバックする', async () => {
      await startWith({
        routes: [
          {
            method: 'GET',
            path: '/unknown-err',
            handler: () => {
              throw new Error('unknown')
            },
          },
        ],
        mapError: () => null,
      })

      const response = await fetch(`${baseUrl}/unknown-err`)

      expect(response.status).toBe(500)
      expect(await response.text()).toBe('internal error')
    })
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

describe('isHostAllowed', () => {
  const address = { address: '127.0.0.1', family: 'IPv4', port: 12345 } as const

  it('127.0.0.1と一致するポートのHostヘッダを許可する', () => {
    expect(isHostAllowed('127.0.0.1:12345', address)).toBe(true)
  })

  it('localhostと一致するポートのHostヘッダを許可する', () => {
    expect(isHostAllowed('localhost:12345', address)).toBe(true)
  })

  it('IPv6ループバックと一致するポートのHostヘッダを許可する', () => {
    expect(isHostAllowed('[::1]:12345', address)).toBe(true)
  })

  it('別のポートは拒否する', () => {
    expect(isHostAllowed('127.0.0.1:9999', address)).toBe(false)
  })

  it('ループバック以外のホスト名は拒否する', () => {
    expect(isHostAllowed('attacker.example:12345', address)).toBe(false)
  })

  it('Hostヘッダ未指定は拒否する', () => {
    expect(isHostAllowed(undefined, address)).toBe(false)
  })

  it('空文字は拒否する', () => {
    expect(isHostAllowed('', address)).toBe(false)
  })

  it('addressがnull（listen前）は拒否する', () => {
    expect(isHostAllowed('127.0.0.1:12345', null)).toBe(false)
  })
})

describe('Hostヘッダ検査の統合テスト', () => {
  it('不正なHostヘッダのリクエストは403を返す', async () => {
    await start([
      {
        method: 'GET',
        path: '/api/repo',
        handler: () => ({ status: 200, body: 'should not reach' }),
      },
    ])
    const { port } = new URL(baseUrl)

    const response = await rawHttpGet({
      host: '127.0.0.1',
      port: Number(port),
      path: '/api/repo',
      hostHeader: 'attacker.example:12345',
    })

    expect(response.status).toBe(403)
    expect(response.body).toContain('forbidden')
  })

  it('正しいHostヘッダのリクエストは通常どおり処理する', async () => {
    await start([
      {
        method: 'GET',
        path: '/hello',
        handler: () => ({ status: 200, body: 'hi' }),
      },
    ])
    const { port } = new URL(baseUrl)

    const response = await rawHttpGet({
      host: '127.0.0.1',
      port: Number(port),
      path: '/hello',
      hostHeader: `127.0.0.1:${port}`,
    })

    expect(response.status).toBe(200)
    expect(response.body).toBe('hi')
  })
})

/**
 * http.request を使って Host ヘッダを任意に指定できる GET リクエストを送る。
 * fetch は Host ヘッダを自動設定してしまうので使えない。
 */
function rawHttpGet(params: {
  host: string
  port: number
  path: string
  hostHeader: string
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: params.host,
        port: params.port,
        method: 'GET',
        path: params.path,
        headers: { host: params.hostHeader },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

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
