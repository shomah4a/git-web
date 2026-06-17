<script setup lang="ts">
/**
 * レビューコメントのスレッド表示 (ADR 0057)。
 *
 * - フラット (返信なし)。同一アンカー (new 行範囲) のコメントを縦に並べる
 * - resolved バッジと resolve トグルを持つ。resolve 操作は親へ emit する
 *   (UI からのみ操作、外部 agent は読むだけ)
 * - スレッド下部に「同じ行へのコメント追加」フォームを常時表示する。投稿は親へ
 *   emit し、親が postReview して再取得する。投稿成功でコメント件数が変わるのを
 *   検知して下書きをクリアする (失敗時は下書きを保持)
 */

import { ref, watch } from 'vue'
import type { ReviewCommentDto } from '@git-web/common'

/**
 * 表示行 (displayStart/displayEnd) を任意で持てるコメント。別コミット由来で
 * 翻訳されたコメントは「現在の to に翻訳後の行」を持つため、ラベルは翻訳後を
 * 優先して表示する。未指定なら newLineStart/End に落とす。
 */
type ThreadComment = ReviewCommentDto & {
  readonly displayStart?: number
  readonly displayEnd?: number
}

// boolean prop は型ベース宣言だと未指定時 Vue が false に既定化するため、
// 表示既定 true の showForm は withDefaults で明示的に既定値を与える。
const props = withDefaults(
  defineProps<{
    readonly comments: ReadonlyArray<ThreadComment>
    /** 投稿中フラグ (親が保持)。true の間は投稿ボタンを無効化する。 */
    readonly posting?: boolean
    /** 追加フォームを出すか。行が画面外の退避表示などでは false にする。 */
    readonly showForm?: boolean
  }>(),
  { posting: false, showForm: true },
)

const emit = defineEmits<{
  (e: 'toggle-resolve', payload: { id: string; resolved: boolean }): void
  (e: 'submit-comment', body: string): void
}>()

const draft = ref('')

// 投稿成功で comments 件数が増えたら下書きをクリアする (失敗時は保持)。
watch(
  () => props.comments.length,
  () => {
    draft.value = ''
  },
)

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

function onSubmit(): void {
  if (draft.value.trim() === '') {
    return
  }
  emit('submit-comment', draft.value)
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
    <div v-if="props.showForm" class="comment-add-form">
      <textarea
        v-model="draft"
        class="comment-add-input"
        rows="2"
        placeholder="この行にコメントを追加"
      ></textarea>
      <div class="comment-add-actions">
        <button
          type="button"
          class="comment-add-submit"
          :disabled="props.posting === true || draft.trim() === ''"
          @click="onSubmit"
        >
          投稿
        </button>
      </div>
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
.comment-add-form {
  padding: 0.4rem 0.6rem;
}
.comment-add-input {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--color-input-bg);
  color: var(--color-fg);
  border: 1px solid var(--color-fg-disabled);
  border-radius: 3px;
  padding: 0.35rem;
  resize: vertical;
}
.comment-add-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.3rem;
}
.comment-add-submit {
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--color-fg-disabled);
  background: var(--color-input-bg);
  color: var(--color-fg);
  border-radius: 3px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.8em;
}
.comment-add-submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.comment-add-submit:hover:not(:disabled) {
  background: var(--color-surface-hover);
}
</style>
