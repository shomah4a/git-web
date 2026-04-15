import type { BlobDto } from '@git-web/common'
import type { HighlightedLines, Highlighter } from '../diff/highlighter/types.js'
import { renderMarkdown } from '../markdown/render.js'

export type BlobContentState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'success'
      readonly path: string
      readonly content: string
      readonly binary: boolean
      readonly language: string | null
      readonly lines: ReadonlyArray<string>
      readonly tokens: HighlightedLines | null
      readonly renderedMarkdown: string | null
    }
  | { readonly kind: 'image'; readonly rawUrl: string }
  | { readonly kind: 'binary'; readonly path: string }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'error'; readonly message: string }

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(path.substring(dot).toLowerCase())
}

function buildImageRawUrl(path: string, rev: string | null): string {
  const params = new URLSearchParams()
  params.set('path', path)
  if (rev !== null) {
    params.set('rev', rev)
  }
  return `/api/blob/raw?${params.toString()}`
}

function extractFileName(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.substring(idx + 1) : path
}

/**
 * BlobDto を BlobContentState に変換する。
 *
 * @param blob     取得済みの blob データ
 * @param path     ファイルパス
 * @param rev      リビジョン (worktree の場合は null)
 * @param highlighter  シンタックスハイライター
 * @param isCancelled  呼び出し元の世代チェック。true を返したら中断する
 */
export async function resolveBlobContent(
  blob: BlobDto,
  path: string,
  rev: string | null,
  highlighter: Highlighter,
  isCancelled: () => boolean,
): Promise<BlobContentState | null> {
  if (blob.binary) {
    if (isImagePath(path)) {
      return { kind: 'image', rawUrl: buildImageRawUrl(path, rev) }
    }
    return { kind: 'binary', path: blob.path }
  }

  const lines = blob.content.split('\n')
  let tokens: HighlightedLines | null = null
  let renderedMarkdown: string | null = null

  if (blob.language !== null) {
    try {
      tokens = await highlighter.highlightFile(blob.content, blob.language)
    } catch {
      // トークン化失敗はプレーン fallback
    }
  }

  if (isCancelled()) return null

  const fileName = extractFileName(path).toLowerCase()
  if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
    try {
      renderedMarkdown = await renderMarkdown(blob.content, 'blob-mermaid')
    } catch {
      // レンダリング失敗はソース表示にフォールバック
    }
  }

  if (isCancelled()) return null

  return {
    kind: 'success',
    path: blob.path,
    content: blob.content,
    binary: blob.binary,
    language: blob.language,
    lines,
    tokens,
    renderedMarkdown,
  }
}
