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
 * - ADR 0059: 状態変更系メソッド (POST 等) のみ Origin ヘッダを検査し
 *   (CSRF 対策)、自オリジン以外および欠落は 403 (fail-closed)。さらに
 *   状態変更系のみ body を上限付きで読み取り、超過は 413 で拒否する。
 *   GET / HEAD はストリームに一切触れず従来挙動を維持する。
 *   なお 403 / 413 は本 http 層で直接返し、error-mapper (例外→HTTP, 400 系)
 *   は通らない。この責務境界を後続が崩さないこと。
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

/**
 * 状態変更系リクエストの body 上限 (ADR 0059)。
 * レビューコメントはテキストのため十分大きい固定値で足りる。超過は 413。
 */
const MAX_BODY_BYTES = 1 * 1024 * 1024

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

  let handler = dispatch(options.routes, { method, url, pathname })
  if (handler === null && !pathname.startsWith('/api/') && options.fallback !== undefined) {
    handler = options.fallback
  }

  if (handler === null) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }

  // ADR 0059: Origin 検査・body 読み取りは「実行されるハンドラが状態変更系の
  // ときだけ」行う。未マッチ (404) や安全メソッド (GET/HEAD) はストリームに
  // 触れず従来挙動を維持し、状態変更が起きないパスに CSRF 判定を持ち込まない。
  let body: string | undefined
  if (isStateChangingMethod(method)) {
    if (!isOriginAllowed(req.headers.origin, addressInfo)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden: invalid origin')
      return
    }
    const read = await readRequestBody(req, MAX_BODY_BYTES)
    if (!read.ok) {
      res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('payload too large')
      return
    }
    body = read.body
  }

  const request = { method, url, pathname, body }

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

/**
 * 状態変更系 (副作用を持つ) メソッドか判定する (ADR 0059)。
 * GET / HEAD / OPTIONS は安全メソッドとして Origin 検査・body 読み取りの
 * 対象外にする。
 */
export function isStateChangingMethod(method: string): boolean {
  const upper = method.toUpperCase()
  return upper !== 'GET' && upper !== 'HEAD' && upper !== 'OPTIONS'
}

/**
 * Origin ヘッダが、サーバーが実際に listen しているポートに対する
 * 自オリジン (loopback 系) かを判定する純粋関数 (ADR 0059)。
 *
 * - Host 検査 (isHostAllowed) と同じ 3 表記を許容する。揃えないと
 *   localhost アクセス時に自分の POST が 403 になる回帰が起きる
 * - Origin 欠落は false (fail-closed)。現代ブラウザの POST fetch には
 *   Origin が付くため実害は小さい
 * - scheme は http のみ (本サーバーは loopback の http で listen する)
 */
export function isOriginAllowed(
  originHeader: string | undefined,
  address: AddressInfo | null,
): boolean {
  if (originHeader === undefined || originHeader === '') {
    return false
  }
  if (address === null) {
    // listen 前のため原理的に発生しない。安全側に倒して拒否する
    return false
  }
  const port = address.port.toString()
  return (
    originHeader === `http://127.0.0.1:${port}` ||
    originHeader === `http://localhost:${port}` ||
    originHeader === `http://[::1]:${port}`
  )
}

/**
 * 状態変更系リクエストの body を上限付きで読み取る (ADR 0059)。
 *
 * - 累積バイト数が maxBytes を超えた時点で ok:false を返す。残りの受信データは
 *   `req.resume()` で破棄ドレインし、ソケットを reset させずに 413 レスポンスを
 *   返せるようにする (req.destroy() だと応答到達前に socket hang up になる)
 * - chunk は Buffer 前提 (encoding 未設定の IncomingMessage)。型が緩いので
 *   Buffer 化を明示する
 * - for await の break はイテレータ return() でストリームを destroy するため、
 *   明示的なイベントリスナで実装する
 */
function readRequestBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly body: string } | { readonly ok: false }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false

    const cleanup = (): void => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
    }
    const onData = (chunk: Buffer): void => {
      if (settled) {
        return
      }
      const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        settled = true
        cleanup()
        req.resume() // 残りを破棄ドレイン (reset させない)
        resolve({ ok: false })
        return
      }
      chunks.push(buf)
    }
    const onEnd = (): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve({ ok: true, body: Buffer.concat(chunks).toString('utf-8') })
    }
    const onError = (): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve({ ok: false })
    }

    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
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
