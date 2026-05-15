<script setup lang="ts">
/**
 * worktree 選択用コンボボックス (ADR 0055)。
 *
 * 設計方針:
 * - `RevisionCombobox` と同じ作法 (page-header-slot に Teleport + 適用ボタン
 *   による確定) を踏襲する
 * - **自由入力は受け付けない** (path injection 防御の二次フィルタ)。
 *   選択肢は親から渡される `items` に限定する
 * - 親が `items` を取得してから渡す。本コンポーネントは fetch を持たない
 * - 選択肢には default worktree のラベルを表示 (ユーザーが現在地を把握できる)
 *
 * 受け取る v-model:
 * - `modelValue: string | null`
 *   - null: default worktree (URL の wt クエリ未指定状態)
 *   - string: 選択中の worktree name
 *
 * 確定タイミング:
 * - 選択変更時に `update:modelValue` を即時 emit する (選択 = 即適用)
 * - submit イベントも同タイミングで emit する。親 (WorktreeView) はこれを
 *   契機にエントリ再取得 + URL 同期 + path リセットを行う
 */

import type { WorktreeListItemDto } from '@git-web/common'
import { computed, useId } from 'vue'

const props = defineProps<{
  modelValue: string | null
  items: ReadonlyArray<WorktreeListItemDto>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
  (e: 'submit', value: string | null): void
}>()

const selectId = `worktree-combobox-${useId()}`

/**
 * `<select>` の value にする文字列。
 * null は空文字列に投影する (HTMLOptionElement の value 制約)。
 */
const selectedValue = computed<string>(() => props.modelValue ?? '')

function onChange(ev: Event): void {
  const target = ev.target
  if (!(target instanceof HTMLSelectElement)) return
  const next: string | null = target.value === '' ? null : target.value
  emit('update:modelValue', next)
  emit('submit', next)
}

function describe(item: WorktreeListItemDto): string {
  const branch = item.branch ?? (item.isDetached ? '(detached)' : '(unknown)')
  return `${item.name} — ${branch}`
}

const defaultItem = computed<WorktreeListItemDto | null>(() => {
  for (const item of props.items) {
    if (item.isDefault) return item
  }
  return null
})
</script>

<template>
  <div class="worktree-combobox">
    <label :for="selectId" class="visually-hidden">worktree</label>
    <select
      :id="selectId"
      class="worktree-select"
      :value="selectedValue"
      aria-label="worktree を選択"
      @change="onChange"
    >
      <option value="">
        default
        <template v-if="defaultItem !== null"> ({{ describe(defaultItem) }})</template>
      </option>
      <option v-for="item in props.items" :key="item.name" :value="item.name">
        {{ describe(item) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.worktree-combobox {
  display: inline-block;
}
.worktree-select {
  border: 1px solid var(--color-border-strong);
  border-radius: 3px;
  background-color: var(--color-input-bg);
  color: var(--color-fg);
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 0.25rem 0.5rem;
  min-width: 14em;
  cursor: pointer;
}
.worktree-select:focus {
  outline: 2px solid var(--color-focus-ring, var(--color-border-strong));
  outline-offset: -1px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
