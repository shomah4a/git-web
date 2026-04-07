/**
 * node:http を薄くラップする HTTP サーバーファクトリ。
 *
 * - 登録された routes に従ってディスパッチする
 * - マッチしなかった場合、fallback ハンドラが指定されていれば使う
 *   （静的ファイル配信用）。ただし /api/ で始まるパスは fallback に
 *   回さず 404 を返す（API のタイプミスを SPA fallback で覆い隠さない）
 * - ADR 0009: DNS rebinding 対策として Host ヘッダを検査し、
 *   127.0.0.1:<実際のポート> / localhost:<実際のポート> /
 *   [::1]:<実際のポート> 以外は 403 で拒否する
 * - ハンドラが例外を投げた場合は 500 を返す
 * - 並行性は Node のイベントループに任せる
 * - 対象は常に loopback のみ (ADR 0009: 外部公開しない)
 */

import type { AddressInfo } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Handler, HttpResponse, Route } from './router.js'
import { dispatch, extractPathname } from './router.js'

/**
 * ハンドラで発生した例外を HTTP レスポンスにマッピングする関数。
 *
 * - null を返すと http 層は従来通り 500 internal error に落とす
 * - null 以外のレスポンスを返すと http 層はそれをそのままクライアントに返す
 *
 * ADR 0011 / ADR 0012: 実体は controller/error-mapper.ts だが、http 層は
 * controller を import しないため、関数として main.ts から注入される。
 * http 層が依存するのは関数シグネチャのみ。
 */
export type ErrorMapper = (err: unknown) => HttpResponse | null

export type CreateApiServerOptions = {
  readonly routes: ReadonlyArray<Route>
  /**
   * ルートにマッチしなかった非 API リクエストに対して呼ばれるハンドラ。
   * 静的ファイル配信に用いる。未指定なら常に 404。
   */
  readonly fallback?: Handler
  /**
   * ハンドラが例外を投げた場合に呼ばれるエラーマッパー。
   * 未指定または null を返した場合は従来通り 500 internal error を返す。
   */
  readonly mapError?: ErrorMapper
}

/**
 * routes を束ねた HTTP サーバーを生成する。
 */
export function createApiServer(options: CreateApiServerOptions): Server {
  const serverRef: { current: Server | null } = { current: null }
  const server = createHttpServer((req, res) => {
    void handleRequest(options, serverRef.current, req, res)
  })
  serverRef.current = server
  return server
}

async function handleRequest(
  options: CreateApiServerOptions,
  server: Server | null,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // ADR 0009: Host ヘッダ検査 (DNS rebinding 対策)
  const addressInfo = server !== null ? toAddressInfo(server.address()) : null
  if (!isHostAllowed(req.headers.host, addressInfo)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('forbidden: invalid host header')
    return
  }

  const method = req.method ?? 'GET'
  const url = req.url ?? '/'
  // URL の正規化は 1 回だけ。dispatch にも pathname を渡して再パースを避ける
  const pathname = extractPathname(url)
  const request = { method, url, pathname }

  let handler = dispatch(options.routes, request)
  if (handler === null && !pathname.startsWith('/api/') && options.fallback !== undefined) {
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
    const mapped = options.mapError !== undefined ? options.mapError(err) : null
    if (mapped !== null) {
      const mappedHeaders = mapped.headers ?? {}
      if (!res.headersSent) {
        res.writeHead(mapped.status, { ...mappedHeaders })
      }
      res.end(mapped.body)
      return
    }
    console.error('handler error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('internal error')
  }
}

/**
 * Server.address() の結果を AddressInfo に narrow する。
 * string (UNIX socket) や null の場合は null を返す。
 */
function toAddressInfo(addr: AddressInfo | string | null): AddressInfo | null {
  if (addr === null || typeof addr === 'string') {
    return null
  }
  return addr
}

/**
 * Host ヘッダが、サーバーが実際に listen しているポートに対する
 * 許可された表記 (loopback 系) かを判定する純粋関数。
 *
 * テストしやすいよう Server オブジェクトを取らず AddressInfo を受ける。
 */
export function isHostAllowed(
  hostHeader: string | undefined,
  address: AddressInfo | null,
): boolean {
  if (hostHeader === undefined || hostHeader === '') {
    return false
  }
  if (address === null) {
    // listen 前のため原理的に発生しない。安全側に倒して拒否する
    return false
  }
  const port = address.port.toString()
  return (
    hostHeader === `127.0.0.1:${port}` ||
    hostHeader === `localhost:${port}` ||
    hostHeader === `[::1]:${port}`
  )
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
