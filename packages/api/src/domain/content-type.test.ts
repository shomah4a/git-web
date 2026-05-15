import { describe, expect, it } from 'vitest'
import { inferContentType } from './content-type.js'

describe('inferContentType', () => {
  it('画像拡張子は対応する Content-Type を返す', () => {
    expect(inferContentType('icon.svg')).toBe('image/svg+xml')
    expect(inferContentType('photo.jpg')).toBe('image/jpeg')
  })

  it('画像でない拡張子は application/octet-stream を返す', () => {
    expect(inferContentType('file.xyz')).toBe('application/octet-stream')
  })

  it('拡張子なしは application/octet-stream を返す', () => {
    expect(inferContentType('Makefile')).toBe('application/octet-stream')
  })

  it('パス付きファイル名から拡張子を抽出する', () => {
    expect(inferContentType('src/assets/logo.svg')).toBe('image/svg+xml')
  })
})
