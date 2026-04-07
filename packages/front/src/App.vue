<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { RepoInfoDto } from '@git-web/common'
import { fetchRepoInfo } from './api.js'

const repo = ref<RepoInfoDto | null>(null)
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  try {
    repo.value = await fetchRepoInfo()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
  }
})
</script>

<template>
  <main>
    <h1>git-web</h1>
    <p v-if="errorMessage" class="error">error: {{ errorMessage }}</p>
    <dl v-else-if="repo">
      <dt>repository</dt>
      <dd>{{ repo.cwd }}</dd>
      <dt>HEAD</dt>
      <dd>{{ repo.head }}</dd>
    </dl>
    <p v-else>loading...</p>
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.error {
  color: #c00;
}
dt {
  font-weight: bold;
  margin-top: 0.5rem;
}
dd {
  margin: 0 0 0.5rem 0;
  font-family: ui-monospace, monospace;
}
</style>
