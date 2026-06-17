/**
 * レビューコメントのドメインモデル (ADR 0057 / 0058)。
 *
 * 設計方針:
 * - コメントは「コミット SHA(40桁) + path + new 側連続行範囲」でアンカーする
 * - ReviewSha は 40 桁 hex のみを包む値オブジェクト (Revision と同じ wrapper 流儀)。
 *   既存の SHA_PATTERN (4〜40桁) は流用せず、アンカー用に 40 桁固定で検証する
 * - resolved 状態は本モデルに含めない。append-only の resolved イベントを
 *   foldResolved で畳み込んだ結果を service が ResolvedComment として合成する
 * - 本層は HTTP / ファイル形式に依存しない
 */

import { parseDiffPath } from './diff-path.js'
import { InvalidReviewCommentError } from './errors.js'

const SHA40_PATTERN = /^[0-9a-f]{40}$/

/**
 * 40 桁 commit SHA の値オブジェクト。parseReviewSha 経由でのみ構築する。
 */
export type ReviewSha = {
  readonly value: string
}

export function parseReviewSha(input: string): ReviewSha {
  if (!SHA40_PATTERN.test(input)) {
    throw new InvalidReviewCommentError('sha', `not a 40-hex commit sha: ${input}`)
  }
  return { value: input }
}

/**
 * 永続化されるコメント 1 件 (resolved を含まない不変レコード)。
 */
export type ReviewComment = {
  readonly id: string
  readonly sha: ReviewSha
  readonly path: string
  readonly newLineStart: number
  readonly newLineEnd: number
  readonly body: string
  /** ISO 8601 UTC (タイムゾーン非依存。末尾 Z) */
  readonly createdAt: string
}

/**
 * resolved 状態を合成したコメント (service の戻り値 / DTO 化対象)。
 */
export type ResolvedComment = ReviewComment & {
  readonly resolved: boolean
}

/**
 * resolved の切替イベント (append-only ログの 1 行)。
 */
export type ResolvedEvent = {
  readonly id: string
  readonly resolved: boolean
  /** ISO 8601 UTC */
  readonly ts: string
}

export type BuildReviewCommentInput = {
  readonly id: string
  readonly sha: string
  readonly path: string
  readonly newLineStart: number
  readonly newLineEnd: number
  readonly body: string
  readonly createdAt: string
}

/**
 * 入力を検証して ReviewComment を構築する純粋関数。
 *
 * - sha は 40 桁 hex (parseReviewSha)
 * - path は parseDiffPath に委譲 (不正は InvalidDiffPathError が伝播)
 * - 行範囲は整数かつ 1 <= start <= end
 * - body は trim して非空、id は非空
 */
export function buildReviewComment(input: BuildReviewCommentInput): ReviewComment {
  const sha = parseReviewSha(input.sha)
  const path = parseDiffPath(input.path)
  if (input.id === '') {
    throw new InvalidReviewCommentError('id', 'id must not be empty')
  }
  if (!Number.isInteger(input.newLineStart) || !Number.isInteger(input.newLineEnd)) {
    throw new InvalidReviewCommentError('range', 'line numbers must be integers')
  }
  if (input.newLineStart < 1) {
    throw new InvalidReviewCommentError('range', `newLineStart must be >= 1: ${input.newLineStart}`)
  }
  if (input.newLineEnd < input.newLineStart) {
    throw new InvalidReviewCommentError(
      'range',
      `newLineEnd (${input.newLineEnd}) must be >= newLineStart (${input.newLineStart})`,
    )
  }
  if (input.body.trim() === '') {
    throw new InvalidReviewCommentError('body', 'body must not be empty')
  }
  return {
    id: input.id,
    sha,
    path,
    newLineStart: input.newLineStart,
    newLineEnd: input.newLineEnd,
    body: input.body,
    createdAt: input.createdAt,
  }
}

/**
 * resolved イベント列を id ごとに「最後勝ち」で畳み込む純粋関数。
 *
 * イベントは append 順に並んでいる前提で、後に現れた値が勝つ。
 * 戻り値は id -> resolved の immutable な Map。
 */
export function foldResolved(events: ReadonlyArray<ResolvedEvent>): ReadonlyMap<string, boolean> {
  const result = new Map<string, boolean>()
  for (const event of events) {
    result.set(event.id, event.resolved)
  }
  return result
}

/**
 * コメント列に resolved 状態を合成する純粋関数。
 * resolved イベントに現れない id は未解決 (false) とする。
 */
export function mergeResolved(
  comments: ReadonlyArray<ReviewComment>,
  resolved: ReadonlyMap<string, boolean>,
): ReadonlyArray<ResolvedComment> {
  return comments.map((comment) => ({
    ...comment,
    resolved: resolved.get(comment.id) ?? false,
  }))
}
