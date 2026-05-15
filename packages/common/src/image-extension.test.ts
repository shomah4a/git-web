import { describe, expect, it } from 'vitest'
import {
  IMAGE_EXTENSION_TO_MIME,
  inferImageContentType,
  isImageExtension,
} from './image-extension.js'

describe('isImageExtension', () => {
  it.each([
    ['.png'],
    ['.apng'],
    ['.jpg'],
    ['.jpeg'],
    ['.jfif'],
    ['.gif'],
    ['.svg'],
    ['.webp'],
    ['.avif'],
    ['.ico'],
    ['.bmp'],
  ])('%s 拡張子は画像と判定する', (ext) => {
    expect(isImageExtension(`file${ext}`)).toBe(true)
  })

  it('大文字拡張子も画像と判定する', () => {
    expect(isImageExtension('FILE.PNG')).toBe(true)
    expect(isImageExtension('icon.SVG')).toBe(true)
  })

  it('未知の拡張子は画像と判定しない', () => {
    expect(isImageExtension('file.txt')).toBe(false)
    expect(isImageExtension('archive.zip')).toBe(false)
  })

  it('拡張子のないファイル名は画像と判定しない', () => {
    expect(isImageExtension('Makefile')).toBe(false)
  })

  it('image.svg.bak のように末尾が画像拡張子でない場合は画像と判定しない', () => {
    expect(isImageExtension('image.svg.bak')).toBe(false)
  })
})

describe('inferImageContentType', () => {
  it('.svg は image/svg+xml を返す', () => {
    expect(inferImageContentType('icon.svg')).toBe('image/svg+xml')
  })

  it('.jfif は image/jpeg を返す', () => {
    expect(inferImageContentType('photo.jfif')).toBe('image/jpeg')
  })

  it('.avif は image/avif を返す', () => {
    expect(inferImageContentType('img.avif')).toBe('image/avif')
  })

  it('.apng は image/apng を返す', () => {
    expect(inferImageContentType('anim.apng')).toBe('image/apng')
  })

  it('画像でない拡張子は null を返す', () => {
    expect(inferImageContentType('file.txt')).toBeNull()
  })

  it('拡張子のないファイル名は null を返す', () => {
    expect(inferImageContentType('Makefile')).toBeNull()
  })
})

describe('IMAGE_EXTENSION_TO_MIME', () => {
  it('全エントリの key は小文字でドット始まりであること', () => {
    for (const ext of IMAGE_EXTENSION_TO_MIME.keys()) {
      expect(ext.startsWith('.')).toBe(true)
      expect(ext).toBe(ext.toLowerCase())
    }
  })

  it('全エントリの value は image/ で始まること', () => {
    for (const mime of IMAGE_EXTENSION_TO_MIME.values()) {
      expect(mime.startsWith('image/')).toBe(true)
    }
  })
})
