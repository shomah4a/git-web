import type { BlobDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import { createNoOpHighlighter } from '../diff/highlighter/no-op.js'
import { resolveBlobContent } from './blob-content-state.js'

const highlighter = createNoOpHighlighter()
const notCancelled = (): boolean => false

function makeBlob(overrides: Partial<BlobDto> = {}): BlobDto {
  return {
    path: 'sample.bin',
    rev: 'HEAD',
    content: '',
    binary: false,
    language: null,
    ...overrides,
  }
}

describe('resolveBlobContent — 画像判定', () => {
  it('SVG (binary:false) は image kind になる', async () => {
    const blob = makeBlob({
      path: 'icon.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      binary: false,
    })
    const result = await resolveBlobContent(blob, 'icon.svg', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
    if (result?.kind === 'image') {
      expect(result.rawUrl).toBe('/api/blob/raw?path=icon.svg&rev=HEAD')
    }
  })

  it('PNG (binary:true) は image kind になる', async () => {
    const blob = makeBlob({ path: 'logo.png', content: '', binary: true })
    const result = await resolveBlobContent(blob, 'logo.png', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
  })

  it('AVIF は image kind になる', async () => {
    const blob = makeBlob({ path: 'pic.avif', content: '', binary: true })
    const result = await resolveBlobContent(blob, 'pic.avif', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
  })

  it('APNG は image kind になる', async () => {
    const blob = makeBlob({ path: 'anim.apng', content: '', binary: true })
    const result = await resolveBlobContent(blob, 'anim.apng', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
  })

  it('JFIF は image kind になる', async () => {
    const blob = makeBlob({ path: 'photo.jfif', content: '', binary: true })
    const result = await resolveBlobContent(blob, 'photo.jfif', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
  })

  it('大文字の .SVG も image kind になる', async () => {
    const blob = makeBlob({ path: 'ICON.SVG', content: '<svg/>', binary: false })
    const result = await resolveBlobContent(blob, 'ICON.SVG', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('image')
  })

  it('worktree (rev:null) でも image kind の rawUrl が rev なしで生成される', async () => {
    const blob = makeBlob({ path: 'icon.svg', content: '<svg/>', binary: false, rev: null })
    const result = await resolveBlobContent(blob, 'icon.svg', null, highlighter, notCancelled)
    expect(result?.kind).toBe('image')
    if (result?.kind === 'image') {
      expect(result.rawUrl).toBe('/api/blob/raw?path=icon.svg')
    }
  })

  it('テキスト (.txt, binary:false) は success kind になる', async () => {
    const blob = makeBlob({ path: 'note.txt', content: 'hello', binary: false })
    const result = await resolveBlobContent(blob, 'note.txt', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('success')
  })

  it('画像でないバイナリ (.exe, binary:true) は binary kind になる', async () => {
    const blob = makeBlob({ path: 'tool.exe', content: '', binary: true })
    const result = await resolveBlobContent(blob, 'tool.exe', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('binary')
  })

  it('image.svg.bak のように末尾が画像拡張子でない場合は success kind になる', async () => {
    const blob = makeBlob({ path: 'image.svg.bak', content: '<svg/>', binary: false })
    const result = await resolveBlobContent(
      blob,
      'image.svg.bak',
      'HEAD',
      highlighter,
      notCancelled,
    )
    expect(result?.kind).toBe('success')
  })

  it('拡張子のないテキスト (Makefile) は success kind になる', async () => {
    const blob = makeBlob({ path: 'Makefile', content: 'all:\n', binary: false })
    const result = await resolveBlobContent(blob, 'Makefile', 'HEAD', highlighter, notCancelled)
    expect(result?.kind).toBe('success')
  })

  it('isCancelled が true を返したら null を返す', async () => {
    const blob = makeBlob({ path: 'note.txt', content: 'hello', binary: false })
    const result = await resolveBlobContent(blob, 'note.txt', 'HEAD', highlighter, () => true)
    expect(result).toBeNull()
  })
})
