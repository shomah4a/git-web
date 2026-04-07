/**
 * node:http を薄くラップする HTTP サーバーファクトリ。
 *
 * - 登録された routes に従ってディスパッチする
 * - ハンドラが例外を投げた場合は 500 を返す
 * - 並行性は Node のイベントループに任せる
 * - 対象は常に 127.0.0.1 のみ (ADR 0009: 外部公開しない)
 */

import { createServer as createHttpServer } from 'node:http'
import type { Server } from 'node:http'
import type { Route } from './router.js'
import { dispatch } from './router.js'

export type CreateApiServerOptions = {
  readonly routes: ReadonlyArray<Route>
}

/**
 * routes を束ねた HTTP サーバーを生成する。
 * 返されたサーバーは listen 関数でリッスンを開始する。
 */
export function createApiServer(options: CreateApiServerOptions): Server {
  return createHttpServer((req, res) => {
    void handleRequest(options.routes, req, res)
  })
}

async function handleRequest(
  routes: ReadonlyArray<Route>,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  const method = req.method ?? 'GET'
  const url = req.url ?? '/'
  const handler = dispatch(routes, { method, url })
  if (handler === null) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  try {
    const response = await handler({ method, url })
    const headers = response.headers ?? {}
    res.writeHead(response.status, { ...headers })
    res.end(response.body)
  } catch (err) {
    console.error('handler error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('internal error')
  }
}

export type ListenAddress = {
  readonly host: string
  readonly port: number
}

/**
 * Server を指定のホストとポートでリッスンさせる。
 * port に 0 を渡すと空きポートが自動割当される。
 */
export function listen(server: Server, host: string, port: number): Promise<ListenAddress> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.removeListener('error', onError)
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        reject(new Error('failed to resolve server address'))
        return
      }
      resolve({ host: addr.address, port: addr.port })
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

/**
 * Server を閉じる。既存のコネクションが捌けるのを待つ。
 */
export function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}
