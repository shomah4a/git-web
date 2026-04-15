/**
 * v-html でレンダリングされた HTML から見出しを抽出してアウトラインを生成する (ADR 0040)。
 *
 * DOM ベースの抽出により、レンダラに依存しない汎用的なアウトライン生成を実現する。
 */

import { type Ref, nextTick, ref, watch } from 'vue'

export interface OutlineHeading {
  readonly level: number
  readonly text: string
  readonly id: string
}

/**
 * テキストを GitHub 方式のスラッグに変換する。
 * 小文字化、スペースを `-` に、ASCII 英数字とハイフン以外を除去。
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
}

/**
 * 重複する id に連番サフィックスを付与する。
 */
export function assignUniqueIds(
  headings: ReadonlyArray<{ level: number; text: string }>,
): ReadonlyArray<OutlineHeading> {
  const counts = new Map<string, number>()
  const result: OutlineHeading[] = []

  for (const h of headings) {
    const base = slugify(h.text)
    const count = counts.get(base)
    let id: string
    if (count === undefined) {
      id = base
      counts.set(base, 1)
    } else {
      id = `${base}-${count.toString()}`
      counts.set(base, count + 1)
    }
    result.push({ level: h.level, text: h.text, id })
  }

  return result
}

/**
 * 指定された DOM 要素内の見出し要素を収集し、id を付与する。
 */
export function collectHeadings(container: HTMLElement): ReadonlyArray<OutlineHeading> {
  const elements = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const raw: { level: number; text: string }[] = []

  for (const el of elements) {
    const tag = el.tagName.toLowerCase()
    const level = parseInt(tag.charAt(1), 10)
    const text = el.textContent ?? ''
    raw.push({ level, text })
  }

  const headings = assignUniqueIds(raw)

  // DOM に id を付与
  let i = 0
  for (const el of elements) {
    const heading = headings[i]
    if (heading !== undefined) {
      el.id = heading.id
    }
    i++
  }

  return headings
}

/**
 * v-html のソースデータを監視し、DOM 更新後に見出しを収集する composable。
 *
 * @param containerRef  v-html を含む DOM 要素の template ref
 * @param htmlSource    v-html に渡している文字列の ref (watch 対象)
 */
export function useOutline(
  containerRef: Ref<HTMLElement | null>,
  htmlSource: Ref<string | null>,
): { headings: Ref<ReadonlyArray<OutlineHeading>> } {
  const headings = ref<ReadonlyArray<OutlineHeading>>([])

  watch(
    htmlSource,
    async () => {
      await nextTick()
      const el = containerRef.value
      if (el === null) {
        headings.value = []
        return
      }
      headings.value = collectHeadings(el)
    },
    { immediate: true },
  )

  return { headings }
}
