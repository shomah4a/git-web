<script setup lang="ts">
/**
 * レビューコメントのスレッド表示 (ADR 0057)。
 *
 * - フラット (返信なし)。同一アンカー (new 行範囲) のコメントを縦に並べる
 * - resolved バッジと resolve トグルを持つ。resolve 操作は親へ emit する
 *   (UI からのみ操作、外部 agent は読むだけ)
 * - 行範囲は props のコメントから決まる (先頭コメントの new 行範囲)
 */

import type { ReviewCommentDto } from '@git-web/common'

/**
 * 表示行 (displayStart/displayEnd) を任意で持てるコメント。別コミット由来で
 * 翻訳されたコメントは「現在の to に翻訳後の行」を持つため、ラベルは翻訳後を
 * 優先して表示する (再評価 MEDIUM 対応)。未指定なら newLineStart/End に落とす。
 */
type ThreadComment = ReviewCommentDto & {
  readonly displayStart?: number
  readonly displayEnd?: number
}

const props = defineProps<{
  readonly comments: ReadonlyArray<ThreadComment>
}>()

const emit = defineEmits<{
  (e: 'toggle-resolve', payload: { id: string; resolved: boolean }): void
}>()

function rangeLabel(comment: ThreadComment): string {
  const start = comment.displayStart ?? comment.newLineStart
  const end = comment.displayEnd ?? comment.newLineEnd
  return start === end ? `L${start.toString()}` : `L${start.toString()}-${end.toString()}`
}

function formatDate(iso: string): string {
  // ISO 文字列をそのまま表示 (タイムゾーン非依存。ローカル変換はしない)
  return iso
}

function onToggle(comment: ReviewCommentDto): void {
  emit('toggle-resolve', { id: comment.id, resolved: !comment.resolved })
}
</script>

<template>
  <div class="comment-thread">
    <div
      v-for="comment in props.comments"
      :key="comment.id"
      class="comment"
      :class="{ resolved: comment.resolved }"
    >
      <div class="comment-head">
        <span class="comment-range">{{ rangeLabel(comment) }}</span>
        <span v-if="comment.resolved" class="comment-resolved-badge">resolved</span>
        <span class="comment-date">{{ formatDate(comment.createdAt) }}</span>
        <button type="button" class="comment-resolve-btn" @click="onToggle(comment)">
          {{ comment.resolved ? '未解決に戻す' : '解決' }}
        </button>
      </div>
      <div class="comment-body">{{ comment.body }}</div>
    </div>
  </div>
</template>

<style scoped>
.comment-thread {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  margin: 0.4rem 0.5rem;
  background: var(--color-surface-1);
}
.comment {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 0.85em;
}
.comment:last-child {
  border-bottom: none;
}
.comment.resolved {
  opacity: 0.65;
}
.comment-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: var(--color-fg-muted);
  margin-bottom: 0.25rem;
}
.comment-range {
  font-family: var(--font-mono);
  font-weight: bold;
}
.comment-resolved-badge {
  font-size: 0.75em;
  padding: 0 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-status-added);
}
.comment-date {
  font-size: 0.75em;
  color: var(--color-fg-faint);
  margin-left: auto;
}
.comment-resolve-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  padding: 0 0.4rem;
  font-size: 0.85em;
  color: var(--color-fg-subtle);
  font-family: inherit;
}
.comment-resolve-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-fg);
}
.comment-body {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-fg);
}
</style>
