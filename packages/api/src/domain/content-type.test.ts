import { describe, expect, it } from 'vitest'
import { inferContentType, isImageContentType } from './content-type.js'

describe('inferContentType', () => {
  it('.png を image/png と推定する', () => {
    expect(inferContentType('image.png')).toBe('image/png')
  })

  it('.jpg を image/jpeg と推定する', () => {
    expect(inferContentType('photo.jpg')).toBe('image/jpeg')
  })

  it('.jpeg を image/jpeg と推定する', () => {
    expect(inferContentType('photo.jpeg')).toBe('image/jpeg')
  })

  it('.gif を image/gif と推定する', () => {
    expect(inferContentType('anim.gif')).toBe('image/gif')
  })

  it('.svg を image/svg+xml と推定する', () => {
    expect(inferContentType('icon.svg')).toBe('image/svg+xml')
  })

  it('.webp を image/webp と推定する', () => {
    expect(inferContentType('img.webp')).toBe('image/webp')
  })

  it('大文字拡張子も正しく推定する', () => {
    expect(inferContentType('IMG.PNG')).toBe('image/png')
  })

  it('未知の拡張子は application/octet-stream を返す', () => {
    expect(inferContentType('file.xyz')).toBe('application/octet-stream')
  })

  it('拡張子なしは application/octet-stream を返す', () => {
    expect(inferContentType('Makefile')).toBe('application/octet-stream')
  })

  it('パス付きファイル名から拡張子を抽出する', () => {
    expect(inferContentType('src/assets/logo.svg')).toBe('image/svg+xml')
  })
})

describe('isImageContentType', () => {
  it('image/png を画像と判定する', () => {
    expect(isImageContentType('image/png')).toBe(true)
  })

  it('application/octet-stream を画像と判定しない', () => {
    expect(isImageContentType('application/octet-stream')).toBe(false)
  })

  it('text/html を画像と判定しない', () => {
    expect(isImageContentType('text/html')).toBe(false)
  })
})
