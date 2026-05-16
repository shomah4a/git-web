<script setup lang="ts">
/**
 * history アイコン (ADR 0056)。
 *
 * BlobView / WorktreeBlobView のツールバー、および将来の history 関連 UI で
 * 共通利用する Lucide 系の rotate-ccw-clock 風 SVG。`currentColor` で塗るため
 * 親要素の色設定に従う。
 */
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
</template>
