/**
 * レビューコメントのユースケース層 (ADR 0057 / 0058)。
 *
 * 設計方針 (ADR 0011):
 * - 依存は ReviewStore port と GitShaResolver port のみ。HTTP / DTO に依存しない
 * - 引数は Revision (ドメイン型)。内部で 40 桁 SHA に解決してから永続化層へ渡す
 * - resolved の畳み込み (foldResolved/mergeResolved) は domain の純粋関数に委譲する
 */

import type { GitShaResolver } from '../domain/ports/git-sha-resolver.js'
import type { ReviewStore } from '../domain/ports/review-store.js'
import type { ResolvedComment } from '../domain/review.js'
import { foldResolved, mergeResolved, parseReviewSha } from '../domain/review.js'
import type { Revision } from '../domain/revision.js'

export type ReviewListResult = {
  /** 解決済みの 40 桁 commit SHA (アンカーのキー) */
  readonly sha: string
  readonly comments: ReadonlyArray<ResolvedComment>
}

export type ReviewService = {
  /**
   * 指定リビジョンを 40 桁 SHA に解決し、そのコミットのコメント一覧を
   * resolved 状態を合成して返す。
   */
  listForRevision(rev: Revision): Promise<ReviewListResult>
}

export function createReviewService(deps: {
  readonly store: ReviewStore
  readonly shaResolver: GitShaResolver
}): ReviewService {
  const { store, shaResolver } = deps
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
  }
}
