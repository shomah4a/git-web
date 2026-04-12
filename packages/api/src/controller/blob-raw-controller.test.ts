import { describe, expect, it } from 'vitest'
import type { RawBlobReader } from '../domain/ports/raw-blob-reader.js'
import type { HttpRequest } from '../http/router.js'
import { createBlobRawHandler } from './blob-raw-controller.js'

function fakeReader(files: Record<string, Buffer>): RawBlobReader {
  return {
    read(path) {
      const buf = files[path]
      if (buf === undefined) return Promise.resolve(null)
      return Promise.resolve({ buffer: buf })
    },
  }
}

function req(url: string): HttpRequest {
  return { method: 'GET', url }
}

describe('createBlobRawHandler', () => {
  it('画像ファイルを正しい Content-Type で返す', async () => {
    const handler = createBlobRawHandler(fakeReader({ 'img.png': Buffer.from([0x89]) }))
    const res = await handler(req('/api/blob/raw?path=img.png&rev=HEAD'))
    expect(res.status).toBe(200)
    expect(res.headers?.['content-type']).toBe('image/png')
    expect(Buffer.from(res.body)).toEqual(Buffer.from([0x89]))
  })

  it('存在しないパスで 404 を返す', async () => {
    const handler = createBlobRawHandler(fakeReader({}))
    const res = await handler(req('/api/blob/raw?path=no.png&rev=HEAD'))
    expect(res.status).toBe(404)
  })

  it('path パラメータ未指定で InvalidDiffPathError を throw する', async () => {
    const handler = createBlobRawHandler(fakeReader({}))
    await expect(handler(req('/api/blob/raw?rev=HEAD'))).rejects.toThrow()
  })

  it('未知の拡張子は application/octet-stream で返す', async () => {
    const handler = createBlobRawHandler(fakeReader({ 'data.bin': Buffer.from([0x00]) }))
    const res = await handler(req('/api/blob/raw?path=data.bin&rev=HEAD'))
    expect(res.status).toBe(200)
    expect(res.headers?.['content-type']).toBe('application/octet-stream')
  })
})
