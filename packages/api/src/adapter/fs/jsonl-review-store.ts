/**
 * ReviewStore の JSONL 実装 (ADR 0058 / 0059)。
 *
 * 設計方針:
 * - `<reviewsDir>/<sha>.jsonl` にコメント本体を append-only で書く
 * - `<reviewsDir>/<sha>.resolved.jsonl` に resolved イベントを append-only で書く
 * - 1 行 = 1 レコードを `appendFile` 1 回で書き、並行追記時の行交錯を避ける
 * - read 時は行ごとに parse し、壊れた行は warn ログを出してスキップする
 * - reviewsDir は呼び出し側で realpath 解決済みの絶対パスを渡す。書き込み先が
 *   reviewsDir 配下にあることを isInsideRepo で二層確認する (ADR 0059)。sha は
 *   ReviewSha (40桁hex) なので構造的にトラバーサル不能だが defense-in-depth
 * - fs 関数は注入する (副作用の外部化 / テスト容易性)
 */

import { resolve } from 'node:path'
import type { ResolvedEvent, ReviewComment, ReviewSha } from '../../domain/review.js'
import type { ReviewStore } from '../../domain/ports/review-store.js'
import { isInsideRepo } from './is-inside-repo.js'
import {
  parseComment,
  parseResolvedEvent,
  serializeComment,
  serializeResolvedEvent,
} from './jsonl-review-codec.js'

/**
 * 本 adapter が依存する fs の最小サブセット。
 * production では node:fs/promises を渡す。readFile は utf-8 文字列を返す。
 */
export type ReviewStoreFs = {
  readFile(path: string): Promise<string>
  appendFile(path: string, data: string): Promise<void>
  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<ReadonlyArray<string>>
}

const SHA40_PATTERN = /^[0-9a-f]{40}$/

function isNotFoundError(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('code' in err)) {
    return false
  }
  const { code } = err
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * reviewsDir 配下の安全なファイルパスを解決する。
 * sha は 40桁hex 前提だが、二層防御として配下チェックを行う。
 */
function resolveReviewPath(reviewsDir: string, filename: string): string {
  const target = resolve(reviewsDir, filename)
  if (!isInsideRepo(reviewsDir, target)) {
    throw new Error(`review path escapes reviewsDir: ${filename}`)
  }
  return target
}

export function createJsonlReviewStore(params: {
  readonly reviewsDir: string
  readonly fs: ReviewStoreFs
}): ReviewStore {
  const { reviewsDir, fs } = params

  /**
   * ファイルを行配列で読む。未存在なら空配列。
   * 空行は除外する (末尾改行による空要素対策)。
   */
  async function readLines(filename: string): Promise<ReadonlyArray<string>> {
    const path = resolveReviewPath(reviewsDir, filename)
    let content: string
    try {
      content = await fs.readFile(path)
    } catch (err) {
      if (isNotFoundError(err)) {
        return []
      }
      throw err
    }
    return content.split('\n').filter((line) => line.trim() !== '')
  }

  async function appendLine(filename: string, line: string): Promise<void> {
    await fs.mkdir(reviewsDir)
    const path = resolveReviewPath(reviewsDir, filename)
    await fs.appendFile(path, line + '\n')
  }

  return {
    async listComments(sha: ReviewSha): Promise<ReadonlyArray<ReviewComment>> {
      const filename = `${sha.value}.jsonl`
      const lines = await readLines(filename)
      const comments: ReviewComment[] = []
      for (const line of lines) {
        try {
          comments.push(parseComment(line))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error'
          console.warn(`[review-store] skipping broken comment line in ${filename}: ${message}`)
        }
      }
      return comments
    },

    async appendComment(comment: ReviewComment): Promise<void> {
      await appendLine(`${comment.sha.value}.jsonl`, serializeComment(comment))
    },

    async listResolvedEvents(sha: ReviewSha): Promise<ReadonlyArray<ResolvedEvent>> {
      const filename = `${sha.value}.resolved.jsonl`
      const lines = await readLines(filename)
      const events: ResolvedEvent[] = []
      for (const line of lines) {
        try {
          events.push(parseResolvedEvent(line))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error'
          console.warn(`[review-store] skipping broken resolved line in ${filename}: ${message}`)
        }
      }
      return events
    },

    async appendResolvedEvent(sha: ReviewSha, event: ResolvedEvent): Promise<void> {
      await appendLine(`${sha.value}.resolved.jsonl`, serializeResolvedEvent(event))
    },

    async listCommitShasWithComments(): Promise<ReadonlyArray<string>> {
      let entries: ReadonlyArray<string>
      try {
        entries = await fs.readdir(reviewsDir)
      } catch (err) {
        if (isNotFoundError(err)) {
          return []
        }
        throw err
      }
      // `<sha>.jsonl` (resolved ログ `<sha>.resolved.jsonl` は除く) から 40 桁 SHA を抽出
      const shas: string[] = []
      for (const name of entries) {
        if (!name.endsWith('.jsonl') || name.endsWith('.resolved.jsonl')) {
          continue
        }
        const base = name.slice(0, name.length - '.jsonl'.length)
        if (SHA40_PATTERN.test(base)) {
          shas.push(base)
        }
      }
      return shas
    },
  }
}
