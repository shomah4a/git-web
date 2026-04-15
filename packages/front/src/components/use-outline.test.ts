import { describe, expect, it } from 'vitest'
import { assignUniqueIds, collectHeadings, slugify } from './use-outline.js'

describe('slugify', () => {
  it('スペースをハイフンに変換する', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('大文字を小文字に変換する', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('記号を除去する', () => {
    expect(slugify('hello, world!')).toBe('hello-world')
  })

  it('連続するスペースを単一のハイフンに変換する', () => {
    expect(slugify('hello   world')).toBe('hello-world')
  })

  it('前後の空白を除去する', () => {
    expect(slugify('  hello  ')).toBe('hello')
  })

  it('日本語テキストを保持する', () => {
    expect(slugify('はじめに')).toBe('はじめに')
  })

  it('日本語と英語の混在テキストを処理する', () => {
    expect(slugify('はじめに Introduction')).toBe('はじめに-introduction')
  })

  it('空文字列を返す', () => {
    expect(slugify('')).toBe('')
  })
})

describe('assignUniqueIds', () => {
  it('見出しごとにスラッグベースの id を割り当てる', () => {
    const headings = [
      { level: 1, text: 'Hello' },
      { level: 2, text: 'World' },
    ]
    const result = assignUniqueIds(headings)
    expect(result).toEqual([
      { level: 1, text: 'Hello', id: 'hello' },
      { level: 2, text: 'World', id: 'world' },
    ])
  })

  it('重複するテキストに連番サフィックスを付与する', () => {
    const headings = [
      { level: 2, text: 'Section' },
      { level: 2, text: 'Section' },
      { level: 2, text: 'Section' },
    ]
    const result = assignUniqueIds(headings)
    expect(result).toEqual([
      { level: 2, text: 'Section', id: 'section' },
      { level: 2, text: 'Section', id: 'section-1' },
      { level: 2, text: 'Section', id: 'section-2' },
    ])
  })

  it('空配列を渡すと空配列を返す', () => {
    expect(assignUniqueIds([])).toEqual([])
  })
})

describe('collectHeadings', () => {
  it('コンテナ内の見出し要素を収集して id を付与する', () => {
    const container = document.createElement('div')
    container.innerHTML = '<h1>Title</h1><h2>Section A</h2><h3>Subsection</h3>'

    const result = collectHeadings(container)

    expect(result).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: 'Section A', id: 'section-a' },
      { level: 3, text: 'Subsection', id: 'subsection' },
    ])

    // DOM の id 属性も確認
    expect(container.querySelector('h1')?.id).toBe('title')
    expect(container.querySelector('h2')?.id).toBe('section-a')
    expect(container.querySelector('h3')?.id).toBe('subsection')
  })

  it('見出しがないコンテナでは空配列を返す', () => {
    const container = document.createElement('div')
    container.innerHTML = '<p>No headings here</p>'

    const result = collectHeadings(container)
    expect(result).toEqual([])
  })

  it('重複する見出しテキストに連番 id を付与する', () => {
    const container = document.createElement('div')
    container.innerHTML = '<h2>API</h2><h2>API</h2><h2>API</h2>'

    const result = collectHeadings(container)

    expect(result[0]?.id).toBe('api')
    expect(result[1]?.id).toBe('api-1')
    expect(result[2]?.id).toBe('api-2')

    const h2s = container.querySelectorAll('h2')
    expect(h2s[0]?.id).toBe('api')
    expect(h2s[1]?.id).toBe('api-1')
    expect(h2s[2]?.id).toBe('api-2')
  })

  it('空テキストの見出しを除外する', () => {
    const container = document.createElement('div')
    container.innerHTML = '<h1>Title</h1><h2></h2><h2>  </h2><h3>Content</h3>'

    const result = collectHeadings(container)

    expect(result).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 3, text: 'Content', id: 'content' },
    ])

    // 空見出しに id が付与されていないことを確認
    const h2s = container.querySelectorAll('h2')
    expect(h2s[0]?.id).toBe('')
    expect(h2s[1]?.id).toBe('')
  })
})
