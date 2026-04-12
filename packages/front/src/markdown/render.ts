/**
 * Markdown レンダリングユーティリティ (ADR 0028)。
 *
 * marked でパース → Mermaid コードブロックを SVG に変換 → DOMPurify でサニタイズ。
 * BlobView と RevisionTreeView の README 表示で共通利用する。
 * DOMPurify の設定を一箇所にまとめ、セキュリティ設定の不整合を防止する。
 */

import DOMPurify from 'dompurify'
import { Marked } from 'marked'

/**
 * DOMPurify で許可する SVG 関連タグ。
 * Mermaid が生成する SVG に必要な要素のみ許可する。
 */
const PURIFY_ADD_TAGS = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'clipPath',
  'marker',
  'foreignObject',
  'style',
  'use',
]

/**
 * DOMPurify で許可する SVG 関連属性。
 */
const PURIFY_ADD_ATTR = [
  'viewBox',
  'xmlns',
  'fill',
  'stroke',
  'stroke-width',
  'd',
  'transform',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'text-anchor',
  'dominant-baseline',
  'font-size',
  'font-family',
  'font-weight',
  'clip-path',
  'marker-end',
  'marker-start',
  'points',
  'dx',
  'dy',
  'opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'aria-roledescription',
  'role',
  'aria-label',
  'tabindex',
]

/**
 * Mermaid を動的 import で必要時のみロードし、SVG に変換する。
 * パース失敗時は空文字を返す (呼び出し側でコードブロック fallback)。
 */
async function renderMermaidBlock(code: string, id: string): Promise<string> {
  try {
    const mermaid = await import('mermaid')
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    mermaid.default.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      suppressErrorRendering: true,
    })
    const result = await mermaid.default.render(id, code)
    return result.svg
  } catch {
    return ''
  }
}

/**
 * Markdown をレンダリングする。
 *
 * @param content Markdown 文字列
 * @param idPrefix Mermaid ダイアグラムの ID プレフィックス (DOM 上の一意性確保用)
 * @returns サニタイズ済み HTML 文字列
 */
export async function renderMarkdown(content: string, idPrefix: string): Promise<string> {
  const mermaidBlocks: { placeholder: string; code: string }[] = []
  let mermaidCounter = 0

  const marked = new Marked()
  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }): string {
        if (lang === 'mermaid') {
          const placeholder = `<!--mermaid-placeholder-${mermaidCounter.toString()}-->`
          mermaidBlocks.push({ placeholder, code: text })
          mermaidCounter++
          return placeholder
        }
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const langAttr = lang !== undefined ? ` class="language-${lang}"` : ''
        return `<pre><code${langAttr}>${escaped}</code></pre>\n`
      },
    },
  })

  let html = await marked.parse(content)

  for (let i = 0; i < mermaidBlocks.length; i++) {
    const block = mermaidBlocks[i]
    if (block === undefined) continue
    const svg = await renderMermaidBlock(block.code, `${idPrefix}-${i.toString()}`)
    if (svg !== '') {
      html = html.replace(block.placeholder, `<div class="mermaid-diagram">${svg}</div>`)
    } else {
      const escaped = block.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      html = html.replace(
        block.placeholder,
        `<pre><code class="language-mermaid">${escaped}</code></pre>`,
      )
    }
  }

  return DOMPurify.sanitize(html, {
    ADD_TAGS: PURIFY_ADD_TAGS,
    ADD_ATTR: PURIFY_ADD_ATTR,
  })
}
