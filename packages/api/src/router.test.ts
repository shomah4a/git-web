import { describe, expect, it } from 'vitest'
import type { Handler, Route } from './router.js'
import { dispatch } from './router.js'

const okHandler: Handler = () => ({ status: 200, body: 'ok' })
const otherHandler: Handler = () => ({ status: 200, body: 'other' })

const routes: ReadonlyArray<Route> = [
  { method: 'GET', path: '/api/repo', handler: okHandler },
  { method: 'GET', path: '/api/other', handler: otherHandler },
  { method: 'POST', path: '/api/repo', handler: otherHandler },
]

describe('dispatch関数', () => {
  it('メソッドとパスが一致するハンドラを返す', () => {
    const handler = dispatch(routes, { method: 'GET', url: '/api/repo' })
    expect(handler).toBe(okHandler)
  })

  it('メソッドが異なる場合はマッチしない', () => {
    const handler = dispatch(routes, { method: 'PUT', url: '/api/repo' })
    expect(handler).toBeNull()
  })

  it('パスが異なる場合はマッチしない', () => {
    const handler = dispatch(routes, { method: 'GET', url: '/api/missing' })
    expect(handler).toBeNull()
  })

  it('クエリ文字列が付いていてもパス部分でマッチする', () => {
    const handler = dispatch(routes, { method: 'GET', url: '/api/repo?foo=bar' })
    expect(handler).toBe(okHandler)
  })

  it('同一パスでも異なるメソッドは別ハンドラを返す', () => {
    const getHandler = dispatch(routes, { method: 'GET', url: '/api/repo' })
    const postHandler = dispatch(routes, { method: 'POST', url: '/api/repo' })
    expect(getHandler).toBe(okHandler)
    expect(postHandler).toBe(otherHandler)
  })

  it('ルート配列が空の場合は常にnullを返す', () => {
    const handler = dispatch([], { method: 'GET', url: '/api/repo' })
    expect(handler).toBeNull()
  })
})
