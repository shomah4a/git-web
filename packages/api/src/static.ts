/**
 * 静的ファイル配信ハンドラ。
 *
 * packages/front/dist を想定した、ディレクトリ配信ユーティリティ。
 *
 * ADR 0009 の禁則:
 * - クライアント入力のパスは必ず rootDir 配下に正規化後スコープ確認する
 * - path.resolve 後に rootDir の prefix 配下にあることを確認する
 * - リポジトリ外へのエスケープは 403 を返す
 */

import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { Handler, HttpResponse } from './router.js'

export type CreateStaticHandlerOptions = {
  /**
   * 配信元ディレクトリの絶対パス。
   */
  readonly rootDir: string
}

export function createStaticHandler(options: CreateStaticHandlerOptions): Handler {
  const rootDir = resolve(options.rootDir)
  return async (req) => {
    const pathname = extractPathname(req.url)
    const relative = pathname === '/' ? '/index.html' : pathname
    const requested = resolve(rootDir, `.${relative}`)

    // パストラバーサル対策: 正規化後に rootDir 配下にあることを確認
    if (!isUnder(requested, rootDir)) {
      return forbidden()
    }

    try {
      const stats = await stat(requested)
      if (stats.isDirectory()) {
        // ディレクトリへのアクセスは index.html にフォールバック
        const indexPath = resolve(requested, 'index.html')
        if (!isUnder(indexPath, rootDir)) {
          return forbidden()
        }
        return await serveFile(indexPath)
      }
      if (!stats.isFile()) {
        return notFound()
      }
      return await serveFile(requested)
    } catch {
      return notFound()
    }
  }
}

function extractPathname(url: string): string {
  return new URL(url, 'http://localhost').pathname
}

/**
 * path が parent ディレクトリの配下（または等しい）かを判定する。
 * シンボリックリンクによる脱出は realpath で解決していないため、
 * 配信元 dist が信頼できる成果物であることを前提とする。
 */
function isUnder(path: string, parent: string): boolean {
  if (path === parent) {
    return true
  }
  const prefix = parent.endsWith(sep) ? parent : parent + sep
  return path.startsWith(prefix)
}

async function serveFile(path: string): Promise<HttpResponse> {
  const body = await readFile(path)
  return {
    status: 200,
    headers: { 'content-type': getContentType(path) },
    body,
  }
}

function notFound(): HttpResponse {
  return {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'not found',
  }
}

function forbidden(): HttpResponse {
  return {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'forbidden',
  }
}

function getContentType(path: string): string {
  const ext = extname(path).toLowerCase()
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.map':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}
