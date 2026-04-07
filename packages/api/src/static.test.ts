import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStaticHandler } from './static.js'

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'git-web-static-test-'))
  await writeFile(join(rootDir, 'index.html'), '<!doctype html><title>index</title>')
  await writeFile(join(rootDir, 'style.css'), 'body { margin: 0 }')
  await mkdir(join(rootDir, 'assets'))
  await writeFile(join(rootDir, 'assets', 'app.js'), 'console.log(1)')
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe('createStaticHandler', () => {
  it('ルートパスへのアクセスはindex.htmlを返す', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('text/html; charset=utf-8')
    expect(bodyAsString(response.body)).toContain('index')
  })

  it('明示的なパスに対してファイル内容を返す', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/style.css' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('text/css; charset=utf-8')
    expect(bodyAsString(response.body)).toBe('body { margin: 0 }')
  })

  it('サブディレクトリ配下のファイルも返せる', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/assets/app.js' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('application/javascript; charset=utf-8')
    expect(bodyAsString(response.body)).toBe('console.log(1)')
  })

  it('クエリ文字列付きでもパス部分で解決する', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/style.css?v=123' })

    expect(response.status).toBe(200)
    expect(bodyAsString(response.body)).toBe('body { margin: 0 }')
  })

  it('存在しないファイルは404を返す', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/nope.txt' })

    expect(response.status).toBe(404)
  })

  it('../を含むURLではrootDir外のファイルを返さない', async () => {
    // URL APIが../を事前に正規化するためリクエストはrootDir配下に閉じ込められる。
    // さらにresolve後のisUnderチェックで二重防御している（ADR 0009）。
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/../../etc/passwd' })

    expect(response.status).not.toBe(200)
  })

  it('パーセントエンコードされた%2e%2eはディレクトリ名として扱いrootDirを脱出しない', async () => {
    // URL.pathnameは%2eをデコードしないため、path.resolveにはリテラル文字列として渡る。
    // そのためファイルは見つからず404になる想定。2xxが返らないことを確認する。
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/%2e%2e/%2e%2e/etc/passwd' })

    expect(response.status).not.toBe(200)
  })

  it('拡張子なしファイルはapplication/octet-streamで返す', async () => {
    await writeFile(join(rootDir, 'binary'), 'raw')
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/binary' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('application/octet-stream')
  })

  it('ディレクトリへのアクセスはその配下のindex.htmlを返す', async () => {
    await mkdir(join(rootDir, 'sub'))
    await writeFile(join(rootDir, 'sub', 'index.html'), '<p>sub</p>')
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/sub' })

    expect(response.status).toBe(200)
    expect(bodyAsString(response.body)).toBe('<p>sub</p>')
  })
})

function bodyAsString(body: string | Uint8Array): string {
  if (typeof body === 'string') {
    return body
  }
  return new TextDecoder().decode(body)
}
