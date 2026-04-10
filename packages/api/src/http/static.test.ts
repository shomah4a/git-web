import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
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

  it('rootDir内のsymlinkがrootDir外を指している場合は403を返す', async () => {
    // rootDir の外に秘密ファイルを置き、dist 内からそこへの symlink を張る
    const outside = await mkdtemp(join(tmpdir(), 'git-web-static-outside-'))
    try {
      const secret = join(outside, 'secret.txt')
      await writeFile(secret, 'TOP SECRET')
      await symlink(secret, join(rootDir, 'escape.txt'))

      const handler = createStaticHandler({ rootDir })
      const response = await handler({ method: 'GET', url: '/escape.txt' })

      expect(response.status).toBe(403)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rootDir内の通常のsymlink（rootDir内を指す）は追従して配信する', async () => {
    // dist 内のファイルへの内部 symlink は許可されるべき
    await symlink(join(rootDir, 'style.css'), join(rootDir, 'alias.css'))
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/alias.css' })

    expect(response.status).toBe(200)
    expect(bodyAsString(response.body)).toBe('body { margin: 0 }')
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

describe('createStaticHandler (spaFallback: true)', () => {
  it('拡張子なしの未知パスでindex.htmlを返す', async () => {
    const handler = createStaticHandler({ rootDir, spaFallback: true })

    const response = await handler({ method: 'GET', url: '/diff' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('text/html; charset=utf-8')
    expect(bodyAsString(response.body)).toContain('index')
  })

  it('拡張子付きの未知パスは404を返す', async () => {
    const handler = createStaticHandler({ rootDir, spaFallback: true })

    const response = await handler({ method: 'GET', url: '/missing.js' })

    expect(response.status).toBe(404)
  })

  it('存在するファイルはそのまま返す', async () => {
    const handler = createStaticHandler({ rootDir, spaFallback: true })

    const response = await handler({ method: 'GET', url: '/style.css' })

    expect(response.status).toBe(200)
    expect(bodyAsString(response.body)).toBe('body { margin: 0 }')
  })

  it('ネストしたパスでもindex.htmlにフォールバックする', async () => {
    const handler = createStaticHandler({ rootDir, spaFallback: true })

    const response = await handler({ method: 'GET', url: '/tree/src/components' })

    expect(response.status).toBe(200)
    expect(bodyAsString(response.body)).toContain('index')
  })

  it('spaFallback無効時は拡張子なしの未知パスでも404を返す', async () => {
    const handler = createStaticHandler({ rootDir })

    const response = await handler({ method: 'GET', url: '/diff' })

    expect(response.status).toBe(404)
  })
})

function bodyAsString(body: string | Uint8Array): string {
  if (typeof body === 'string') {
    return body
  }
  return new TextDecoder().decode(body)
}
