/**
 * node:http を薄くラップする HTTP サーバーファクトリ。
 *
 * - 登録された routes に従ってディスパッチする
 * - マッチしなかった場合、fallback ハンドラが指定されていれば使う
 *   （静的ファイル配信用）。ただし /api/ で始まるパスは fallback に
 *   回さず 404 を返す（API のタイプミスを SPA fallback で覆い隠さない）
 * - ハンドラが例外を投げた場合は 500 を返す
 * - 並行性は Node のイベントループに任せる
 * - 対象は常に 127.0.0.1 のみ (ADR 0009: 外部公開しない)
 */

import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Handler, Route } from './router.js'
import { dispatch } from './router.js'

export type CreateApiServerOptions = {
  readonly routes: ReadonlyArray<Route>
  /**
   * ルートにマッチしなかった非 API リクエストに対して呼ばれるハンドラ。
   * 静的ファイル配信に用いる。未指定なら常に 404。
   */
  readonly fallback?: Handler
}

/**
 * routes を束ねた HTTP サーバーを生成する。
 */
export function createApiServer(options: CreateApiServerOptions): Server {
  return createHttpServer((req, res) => {
    void handleRequest(options, req, res)
  })
}

async function handleRequest(
  options: CreateApiServerOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? 'GET'
  const url = req.url ?? '/'
  const request = { method, url }

  let handler = dispatch(options.routes, request)
  if (handler === null && !isApiPath(url) && options.fallback !== undefined) {
    handler = options.fallback
  }

  if (handler === null) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }

  try {
    const response = await handler(request)
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

function isApiPath(url: string): boolean {
  const pathname = new URL(url, 'http://localhost').pathname
  return pathname.startsWith('/api/')
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
