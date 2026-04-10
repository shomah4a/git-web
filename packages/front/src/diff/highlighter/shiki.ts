/**
 * Shiki を使った Highlighter 実装 (ADR 0017 / ADR 0021)。
 *
 * 設計方針:
 * - `createShikiHighlighter()` は同期 factory。top-level await は使わない
 * - インスタンス (`getSingletonHighlighter` の戻り値) は初回 preload / highlightFile
 *   呼び出し時に lazy で生成し、Promise をクロージャ内にメモ化する
 * - `loadLanguage` の結果は言語別にメモ化し、重複ロードを防ぐ
 * - 失敗は呼び出し側に例外を漏らさず、null / fallback で吸収する
 * - 背景色 / フォントスタイルは無視し、前景色のみ採用する (diff の add / delete
 *   背景色との衝突回避)
 * - color は 6 または 8 桁 hex のみホワイトリストで許可 (過剰防衛)
 * - Shiki の BundledLanguage 型との突合は Shiki 自身の `bundledLanguages`
 *   (ランタイムオブジェクト) をキー集合として利用し、ユーザー定義型ガード
 *   1 箇所で narrow する (`as` は使わない、ADR 0010)
 *
 * ADR 0021 での変更点:
 * - `THEME` 単一から light / dark 2 テーマロードに変更
 * - `codeToTokens` (単一テーマ) から `codeToTokensWithThemes` に変更
 * - 戻り値 `ThemedTokenWithVariants[][]` の `variants` から light / dark 両色を
 *   `HighlightedToken.color` / `colorDark` に格納。テーマ切替時にトークン再計算
 *   を不要にする
 */

import type {
  BundledLanguage,
  Highlighter as ShikiHighlighter,
  ThemedTokenWithVariants,
} from 'shiki'
import { bundledLanguages, getSingletonHighlighter } from 'shiki'
import type { HighlightedLines, HighlightedToken, Highlighter } from './types.js'

const LIGHT_THEME = 'github-light'
const DARK_THEME = 'github-dark'

export function createShikiHighlighter(): Highlighter {
  let instancePromise: Promise<ShikiHighlighter> | null = null
  const loadedLangs = new Map<string, Promise<void>>()

  function getInstance(): Promise<ShikiHighlighter> {
    instancePromise ??= getSingletonHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [],
    })
    return instancePromise
  }

  async function loadLang(lang: BundledLanguage): Promise<void> {
    try {
      const inst = await getInstance()
      await inst.loadLanguage(lang)
    } catch (err) {
      console.warn('[highlighter] loadLanguage failed', lang, err)
    }
  }

  async function preload(lang: string): Promise<void> {
    if (!isBundledLanguage(lang)) {
      return
    }
    const existing = loadedLangs.get(lang)
    if (existing !== undefined) {
      return existing
    }
    const promise = loadLang(lang)
    loadedLangs.set(lang, promise)
    return promise
  }

  async function highlightFile(content: string, lang: string): Promise<HighlightedLines | null> {
    if (!isBundledLanguage(lang)) {
      return null
    }
    try {
      await preload(lang)
      const inst = await getInstance()
      // codeToTokensWithThemes は ThemedTokenWithVariants[][] を直接返す
      // (codeToTokens の { tokens, fg, bg } のような wrapper は無い)。
      const lines = inst.codeToTokensWithThemes(content, {
        themes: { light: LIGHT_THEME, dark: DARK_THEME },
        lang,
      })
      return lines.map(convertLine)
    } catch (err) {
      console.warn('[highlighter] highlightFile failed', lang, err)
      return null
    }
  }

  return { preload, highlightFile }
}

/**
 * Shiki の bundledLanguages (ランタイムオブジェクト) をキー集合として
 * ユーザー定義型ガードを行い、任意の string を BundledLanguage リテラル
 * ユニオンに narrow する。
 *
 * ランタイム検査しているため、型述語の「嘘」はなく `as` 相当の危険は無い。
 * bundledLanguages は dynamic import 関数群を保持しているだけで、参照
 * しただけでは実際の grammar ロードは発生しない (Shiki の lazy 設計)。
 */
function isBundledLanguage(lang: string): lang is BundledLanguage {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, lang)
}

/**
 * Shiki の ThemedTokenWithVariants[] を HighlightedToken[] に変換する。
 *
 * - content はそのまま
 * - variants['light']?.color を 6 / 8 桁 hex ホワイトリストに通して color に格納
 * - variants['dark']?.color 同様に colorDark に格納
 * - variants キーが欠けていれば null (プレーン fallback)
 * - bgColor / fontStyle / htmlStyle 等は無視
 */
function convertLine(
  line: ReadonlyArray<ThemedTokenWithVariants>,
): ReadonlyArray<HighlightedToken> {
  return line.map((token) => {
    const lightStyles = token.variants['light']
    const darkStyles = token.variants['dark']
    return {
      content: token.content,
      color: normalizeColor(lightStyles?.color),
      colorDark: normalizeColor(darkStyles?.color),
    }
  })
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

function normalizeColor(color: string | undefined): string | null {
  if (color === undefined) {
    return null
  }
  return COLOR_PATTERN.test(color) ? color : null
}
