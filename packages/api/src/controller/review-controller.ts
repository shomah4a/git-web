/**
 * レビューコメントの HTTP controller (ADR 0057)。
 *
 * 設計方針 (ADR 0011):
 * - クエリ/ボディのパース + バリデーション + DTO 変換を担当する
 * - ドメインモデル → DTO 変換は object literal で書き `as` は使わない (ADR 0010)
 * - service は注入される
 * - POST 系の Origin/Host/body 上限ガードは http 層 (server.ts, ADR 0059) が担う
 */

import type {
  ReviewCommentDto,
  ReviewCommitsResponseDto,
  ReviewListResponseDto,
} from '@git-web/common'
import { InvalidReviewCommentError } from '../domain/errors.js'
import type { ResolvedComment } from '../domain/review.js'
import { parseRevision } from '../domain/revision.js'
import { jsonResponse } from '../http/response.js'
import type { Handler } from '../http/router.js'
import type { AddCommentInput, ReviewService, SetResolvedInput } from '../service/review-service.js'

/**
 * GET /api/reviews?rev=<revision> のハンドラファクトリ。
 *
 * rev は必須。欠落/空文字は parseRevision が InvalidRevisionError を投げ 400。
 * server 側で 40 桁 SHA に解決し、そのコミットのコメント一覧を返す。
 */
export function createReviewListHandler(service: ReviewService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const rev = parseRevision(url.searchParams.get('rev') ?? '')
    const result = await service.listForRevision(rev)
    const body: ReviewListResponseDto = {
      sha: result.sha,
      comments: result.comments.map(toReviewCommentDto),
    }
    return jsonResponse(200, body)
  }
}

/**
 * GET /api/reviews/commits?from=<rev>&to=<rev> のハンドラファクトリ (ADR 0060 E2)。
 *
 * from / to は必須。from..to の範囲でコメントを持つ commit SHA 一覧を返す。
 */
export function createReviewCommitsHandler(service: ReviewService): Handler {
  return async (req) => {
    const url = new URL(req.url, 'http://localhost')
    const from = parseRevision(url.searchParams.get('from') ?? '')
    const to = parseRevision(url.searchParams.get('to') ?? '')
    const shas = await service.listCommitsWithCommentsInRange(from, to)
    const body: ReviewCommitsResponseDto = { shas }
    return jsonResponse(200, body)
  }
}

/**
 * POST /api/reviews のハンドラファクトリ。
 *
 * body の JSON を検証して service.addComment を呼び、201 で作成 DTO を返す。
 * body 不正 / 必須欠落は InvalidReviewCommentError (400)。値の妥当性 (40桁SHA・
 * 行範囲) は service 内の buildReviewComment が検証する。
 * Origin/Host/body 上限は http 層 (ADR 0059) が担う。
 */
export function createReviewCreateHandler(service: ReviewService): Handler {
  return async (req) => {
    const input = extractCreateInput(parseJsonBody(req.body))
    const created = await service.addComment(input)
    return jsonResponse(201, toReviewCommentDto(created))
  }
}

/**
 * POST /api/reviews/resolve のハンドラファクトリ。
 */
export function createReviewResolveHandler(service: ReviewService): Handler {
  return async (req) => {
    const input = extractResolveInput(parseJsonBody(req.body))
    await service.setResolved(input)
    return jsonResponse(200, { ok: true })
  }
}

function parseJsonBody(body: string | undefined): unknown {
  if (body === undefined || body === '') {
    throw new InvalidReviewCommentError('body', 'request body is empty')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new InvalidReviewCommentError('body', 'request body is not valid JSON')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new InvalidReviewCommentError('body', `field "${key}" must be a string`)
  }
  return value
}

function requireNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number') {
    throw new InvalidReviewCommentError('range', `field "${key}" must be a number`)
  }
  return value
}

function requireBooleanField(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new InvalidReviewCommentError('body', `field "${key}" must be a boolean`)
  }
  return value
}

function extractCreateInput(payload: unknown): AddCommentInput {
  if (!isRecord(payload)) {
    throw new InvalidReviewCommentError('body', 'request body must be a JSON object')
  }
  return {
    sha: requireStringField(payload, 'sha'),
    path: requireStringField(payload, 'path'),
    newLineStart: requireNumberField(payload, 'newLineStart'),
    newLineEnd: requireNumberField(payload, 'newLineEnd'),
    body: requireStringField(payload, 'body'),
  }
}

function extractResolveInput(payload: unknown): SetResolvedInput {
  if (!isRecord(payload)) {
    throw new InvalidReviewCommentError('body', 'request body must be a JSON object')
  }
  return {
    sha: requireStringField(payload, 'sha'),
    id: requireStringField(payload, 'id'),
    resolved: requireBooleanField(payload, 'resolved'),
  }
}

function toReviewCommentDto(comment: ResolvedComment): ReviewCommentDto {
  return {
    id: comment.id,
    sha: comment.sha.value,
    path: comment.path,
    newLineStart: comment.newLineStart,
    newLineEnd: comment.newLineEnd,
    body: comment.body,
    createdAt: comment.createdAt,
    resolved: comment.resolved,
  }
}
