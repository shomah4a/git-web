<script setup lang="ts">
/*
 * テーマ切替ボタングループ (ADR 0021)。
 *
 * 3 値 (light / dark / auto) のトグルボタン群。WAI-ARIA radio group を
 * 名乗らず、`<button aria-pressed>` 3 つのグループとする。radio role は
 * 矢印キー操作が期待されるが、本実装は Tab 操作のみ想定のため role を
 * 外してセマンティクスの齟齬を避ける。
 *
 * 親コンポーネント側で useTheme() の結果を渡す。本コンポーネント自体は
 * ストアを触らない (テスト容易性のため)。
 */

import type { Theme } from '../theme/theme-store.js'

type Props = {
  readonly modelValue: Theme
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: Theme]
}>()

const options: ReadonlyArray<{ readonly value: Theme; readonly label: string }> = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'auto', label: '自動' },
]

function select(value: Theme): void {
  if (props.modelValue !== value) {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <div class="theme-switcher" aria-label="テーマ">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="theme-switcher__btn"
      :class="{ 'theme-switcher__btn--active': props.modelValue === opt.value }"
      :aria-pressed="props.modelValue === opt.value"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.theme-switcher {
  display: inline-flex;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  font-size: 0.85em;
}
.theme-switcher__btn {
  padding: 0.25rem 0.6rem;
  border: none;
  border-right: 1px solid var(--color-border);
  background: var(--color-input-bg);
  color: var(--color-fg-muted);
  cursor: pointer;
  font: inherit;
  line-height: 1.4;
}
.theme-switcher__btn:last-child {
  border-right: none;
}
.theme-switcher__btn:hover {
  background: var(--color-surface-hover);
}
.theme-switcher__btn--active {
  background: var(--color-surface-2);
  color: var(--color-fg);
  font-weight: bold;
}
</style>
