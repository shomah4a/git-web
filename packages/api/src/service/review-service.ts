/**
 * レビューコメントのユースケース層 (ADR 0057 / 0058)。
 *
 * 設計方針 (ADR 0011):
 * - 依存は ReviewStore port と GitShaResolver port のみ。HTTP / DTO に依存しない
 * - 引数は Revision (ドメイン型)。内部で 40 桁 SHA に解決してから永続化層へ渡す
 * - resolved の畳み込み (foldResolved/mergeResolved) は domain の純粋関数に委譲する
 */

import { InvalidReviewCommentError } from '../domain/errors.js'
import type { GitShaResolver } from '../domain/ports/git-sha-resolver.js'
import type { ReviewStore } from '../domain/ports/review-store.js'
import type { ResolvedComment } from '../domain/review.js'
import {
  buildReviewComment,
  foldResolved,
  mergeResolved,
  parseReviewSha,
} from '../domain/review.js'
import type { Revision } from '../domain/revision.js'

export type ReviewListResult = {
  /** 解決済みの 40 桁 commit SHA (アンカーのキー) */
  readonly sha: string
  readonly comments: ReadonlyArray<ResolvedComment>
}

/**
 * コメント作成の入力。sha は 40 桁 commit SHA (front が解決済みの to を渡す)。
 * 値の妥当性は buildReviewComment が検証する。
 */
export type AddCommentInput = {
  readonly sha: string
  readonly path: string
  readonly newLineStart: number
  readonly newLineEnd: number
  readonly body: string
}

export type SetResolvedInput = {
  readonly sha: string
  readonly id: string
  readonly resolved: boolean
}

export type ReviewService = {
  /**
   * 指定リビジョンを 40 桁 SHA に解決し、そのコミットのコメント一覧を
   * resolved 状態を合成して返す。
   */
  listForRevision(rev: Revision): Promise<ReviewListResult>
  /**
   * コメントを作成する。id / createdAt は注入された newId / now で採番する。
   * 作成された (resolved=false の) コメントを返す。
   */
  addComment(input: AddCommentInput): Promise<ResolvedComment>
  /**
   * resolved 状態を切り替える (append-only イベントとして記録)。
   */
  setResolved(input: SetResolvedInput): Promise<void>
}

export function createReviewService(deps: {
  readonly store: ReviewStore
  readonly shaResolver: GitShaResolver
  readonly now: () => Date
  readonly newId: () => string
}): ReviewService {
  const { store, shaResolver, now, newId } = deps
  return {
    async listForRevision(rev) {
      const resolvedSha = await shaResolver.resolveCommitSha(rev)
      const sha = parseReviewSha(resolvedSha)
      const [comments, events] = await Promise.all([
        store.listComments(sha),
        store.listResolvedEvents(sha),
      ])
      return {
        sha: sha.value,
        comments: mergeResolved(comments, foldResolved(events)),
      }
    },

    async addComment(input) {
      const comment = buildReviewComment({
        id: newId(),
        sha: input.sha,
        path: input.path,
        newLineStart: input.newLineStart,
        newLineEnd: input.newLineEnd,
        body: input.body,
        createdAt: now().toISOString(),
      })
      await store.appendComment(comment)
      return { ...comment, resolved: false }
    },

    async setResolved(input) {
      const sha = parseReviewSha(input.sha)
      if (input.id === '') {
        throw new InvalidReviewCommentError('id', 'id must not be empty')
      }
      await store.appendResolvedEvent(sha, {
        id: input.id,
        resolved: input.resolved,
        ts: now().toISOString(),
      })
    },
  }
}
