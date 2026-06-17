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
  /**
   * 事前計算済みの pathname。指定されていれば dispatch はこの値を使い、
   * URL の再パースを回避する。未指定なら url から計算する。
   */
  readonly pathname?: string
  /**
   * リクエストボディ (ADR 0059)。状態変更系メソッド (POST 等) のときのみ
   * http 層が読み取って詰める。GET / HEAD では常に undefined。
   * dispatch はパスマッチングのみ行い body を参照しない。
   * exactOptionalPropertyTypes 下で明示的 undefined 代入を許すため union に含める。
   */
  readonly body?: string | undefined
}

export type HttpResponse = {
  readonly status: number
  readonly headers?: Readonly<Record<string, string>>
  readonly body: string | Uint8Array
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
  const pathname = req.pathname ?? extractPathname(req.url)
  for (const route of routes) {
    if (route.method === req.method && route.path === pathname) {
      return route.handler
    }
  }
  return null
}

/**
 * 相対 URL からパス部分を取り出すユーティリティ。
 * URL コンストラクタは絶対 URL を要求するためダミーオリジンを足す。
 */
export function extractPathname(url: string): string {
  const u = new URL(url, 'http://localhost')
  return u.pathname
}
