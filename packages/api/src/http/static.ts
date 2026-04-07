/**
 * 静的ファイル配信ハンドラ。
 *
 * packages/front/dist を想定した、ディレクトリ配信ユーティリティ。
 *
 * ADR 0009 の禁則:
 * - クライアント入力のパスは必ず rootDir 配下に正規化後スコープ確認する
 * - path.resolve 後に rootDir の prefix 配下にあることを確認する
 * - リポジトリ外へのエスケープは 403 を返す
 * - symlink 越境: rootDir と実ファイルの両方を realpath で解決してから
 *   isUnder を再チェックする（通常 vite build 成果物に symlink は混入
 *   しないが、万一の攻撃 / 誤配置への防御層）
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { Handler, HttpResponse } from './router.js'

export type CreateStaticHandlerOptions = {
  /**
   * 配信元ディレクトリの絶対パス。
   */
  readonly rootDir: string
}

export function createStaticHandler(options: CreateStaticHandlerOptions): Handler {
  const rootDirRaw = resolve(options.rootDir)
  let rootDirResolved: string | null = null

  /**
   * rootDir 自体を realpath で解決した絶対パスを返す。
   * 初回呼び出し時に解決して結果をキャッシュする。
   */
  const getRootDir = async (): Promise<string> => {
    if (rootDirResolved === null) {
      rootDirResolved = await realpath(rootDirRaw)
    }
    return rootDirResolved
  }

  return async (req) => {
    const pathname = extractPathname(req.url)
    const relative = pathname === '/' ? '/index.html' : pathname

    let rootDir: string
    try {
      rootDir = await getRootDir()
    } catch {
      // rootDir 自体が存在しない（front が未ビルド等）
      return notFound()
    }

    const requested = resolve(rootDir, `.${relative}`)

    // パストラバーサル対策: 字面の path.resolve 後に rootDir 配下か確認
    if (!isUnder(requested, rootDir)) {
      return forbidden()
    }

    try {
      const stats = await stat(requested)
      if (stats.isDirectory()) {
        // ディレクトリへのアクセスは配下の index.html にフォールバック
        const indexPath = resolve(requested, 'index.html')
        if (!isUnder(indexPath, rootDir)) {
          return forbidden()
        }
        return await serveResolvedFile(indexPath, rootDir)
      }
      if (!stats.isFile()) {
        return notFound()
      }
      return await serveResolvedFile(requested, rootDir)
    } catch {
      return notFound()
    }
  }
}

/**
 * 指定パスを realpath で解決してから再度スコープチェックを行い、
 * OK ならファイルを配信する。symlink 越境への二重防御。
 */
async function serveResolvedFile(path: string, rootDir: string): Promise<HttpResponse> {
  let real: string
  try {
    real = await realpath(path)
  } catch {
    return notFound()
  }
  if (!isUnder(real, rootDir)) {
    return forbidden()
  }
  return serveFile(real)
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
