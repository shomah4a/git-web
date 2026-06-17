/**
 * ReviewComment / ResolvedEvent と JSONL 1 行の相互変換 (純粋, ADR 0058)。
 *
 * - serialize: ドメイン型 → 1 行の JSON 文字列 (改行を含まない)
 * - parse: 1 行 → ドメイン型。形式不正は例外を投げる。呼び出し側 (store) が
 *   行単位で catch して warn ログを出しスキップする (Errors should never pass
 *   silently に従い、黙殺は store 側の明示ログで行う)
 * - parse は buildReviewComment による再検証を通すため、不正値の行は確実に弾く
 */

import { buildReviewComment, type ResolvedEvent, type ReviewComment } from '../../domain/review.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(`expected string field "${key}"`)
  }
  return value
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number') {
    throw new Error(`expected number field "${key}"`)
  }
  return value
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new Error(`expected boolean field "${key}"`)
  }
  return value
}

export function serializeComment(comment: ReviewComment): string {
  return JSON.stringify({
    id: comment.id,
    sha: comment.sha.value,
    path: comment.path,
    newLineStart: comment.newLineStart,
    newLineEnd: comment.newLineEnd,
    body: comment.body,
    createdAt: comment.createdAt,
  })
}

export function parseComment(line: string): ReviewComment {
  const parsed: unknown = JSON.parse(line)
  if (!isRecord(parsed)) {
    throw new Error('comment line is not a JSON object')
  }
  // buildReviewComment が sha / path / range / body / id を再検証する
  return buildReviewComment({
    id: requireString(parsed, 'id'),
    sha: requireString(parsed, 'sha'),
    path: requireString(parsed, 'path'),
    newLineStart: requireNumber(parsed, 'newLineStart'),
    newLineEnd: requireNumber(parsed, 'newLineEnd'),
    body: requireString(parsed, 'body'),
    createdAt: requireString(parsed, 'createdAt'),
  })
}

export function serializeResolvedEvent(event: ResolvedEvent): string {
  return JSON.stringify({ id: event.id, resolved: event.resolved, ts: event.ts })
}

export function parseResolvedEvent(line: string): ResolvedEvent {
  const parsed: unknown = JSON.parse(line)
  if (!isRecord(parsed)) {
    throw new Error('resolved event line is not a JSON object')
  }
  const id = requireString(parsed, 'id')
  if (id === '') {
    throw new Error('resolved event id must not be empty')
  }
  return {
    id,
    resolved: requireBoolean(parsed, 'resolved'),
    ts: requireString(parsed, 'ts'),
  }
}
