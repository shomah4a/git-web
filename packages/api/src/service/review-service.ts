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
import { parseRevision, type Revision } from '../domain/revision.js'

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
  /**
   * from..to の範囲に含まれ、かつコメントを持つ commit SHA 一覧を返す (ADR 0060 E2)。
   * to 自身を含む。front はこの各 SHA のコメントを取得し translateNewLine で
   * 現在の to 行へ翻訳する。
   */
  listCommitsWithCommentsInRange(from: Revision, to: Revision): Promise<ReadonlyArray<string>>
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
      // M2: アンカー SHA がリポジトリに実在する commit か検証する。
      // 存在しない / commit でない場合は孤立ファイル生成を防ぐため 400 に倒す。
      await assertCommitExists(input.sha)
      await store.appendComment(comment)
      return { ...comment, resolved: false }
    },

    async setResolved(input) {
      const sha = parseReviewSha(input.sha)
      if (input.id === '') {
        throw new InvalidReviewCommentError('id', 'id must not be empty')
      }
      // M3: 対象 comment id が当該コミットに実在するか検証する。
      const comments = await store.listComments(sha)
      if (!comments.some((comment) => comment.id === input.id)) {
        throw new InvalidReviewCommentError('id', `comment not found: ${input.id}`)
      }
      await store.appendResolvedEvent(sha, {
        id: input.id,
        resolved: input.resolved,
        ts: now().toISOString(),
      })
    },

    async listCommitsWithCommentsInRange(from, to) {
      const toSha = await shaResolver.resolveCommitSha(to)
      const rangeShas = new Set(await shaResolver.revListRange(from, to))
      rangeShas.add(toSha)
      const withComments = await store.listCommitShasWithComments()
      return withComments.filter((sha) => rangeShas.has(sha))
    },
  }

  /** M2: sha が実在 commit に解決できなければ InvalidReviewCommentError。 */
  async function assertCommitExists(sha: string): Promise<void> {
    try {
      await shaResolver.resolveCommitSha(parseRevision(sha))
    } catch {
      throw new InvalidReviewCommentError('sha', `commit not found: ${sha}`)
    }
  }
}
