/**
 * 極小ルーター。
 *
 * 設計方針:
 * - I/O を一切持たない純粋関数として実装する
 * - 動的パスパラメータは持たない（将来必要になったら拡張する）
 * - クエリ文字列はパスマッチング対象から除外する
 */

export type HttpRequest = {
  readonly method: string
  readonly url: string
}

export type HttpResponse = {
  readonly status: number
  readonly headers?: Readonly<Record<string, string>>
  readonly body: string
}

export type Handler = (req: HttpRequest) => Promise<HttpResponse> | HttpResponse

export type Route = {
  readonly method: string
  readonly path: string
  readonly handler: Handler
}

/**
 * リクエストにマッチするルートを返す。
 * 見つからなかった場合は null を返す。
 */
export function dispatch(routes: ReadonlyArray<Route>, req: HttpRequest): Handler | null {
  const pathname = extractPathname(req.url)
  for (const route of routes) {
    if (route.method === req.method && route.path === pathname) {
      return route.handler
    }
  }
  return null
}

function extractPathname(url: string): string {
  // url は "/api/repo?foo=bar" のような相対 URL を想定する。
  // URL コンストラクタは絶対 URL を要求するため、ダミーのオリジンを足して解決する。
  const u = new URL(url, 'http://localhost')
  return u.pathname
}
