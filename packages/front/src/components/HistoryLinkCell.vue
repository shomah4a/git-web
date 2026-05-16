<script setup lang="ts">
/**
 * テーブル内のテキストを「ファイル単位 history (/commits?path=) へのリンク」として
 * 表示する共通セル (ADR 0056)。
 *
 * - RevisionTreeView / WorktreeView の Last commit msg / date セルから利用する
 * - 行クリックハンドラとの二重発火を防ぐため `@click.stop` を組み込み済み
 * - リンク化したい本文は default slot で受ける
 */

import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  to: RouteLocationRaw
}>()
</script>

<template>
  <router-link :to="to" class="history-link" title="このファイルの履歴を表示" @click.stop>
    <slot />
  </router-link>
</template>

<style scoped>
.history-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--color-border);
}
.history-link:hover {
  color: var(--color-fg);
  text-decoration-color: var(--color-fg-muted);
}
</style>
