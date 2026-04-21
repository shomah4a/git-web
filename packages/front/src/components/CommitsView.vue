<script setup lang="ts">
/**
 * コミット履歴表示コンポーネント (ADR 0046)。
 *
 * 設計方針:
 * - RevisionCombobox でリビジョン選択 (デフォルト HEAD)
 * - /api/commits でコミット履歴取得 → テーブル形式で表示
 * - 「もっと読み込む」ボタンでカーソルベースページネーション
 * - URL の rev / path クエリでステート管理
 * - 各コミットから diff / tree への導線
 */

import type { CommitDto, RefListDto } from '@git-web/common'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchCommits } from '../api/commits.js'
import { fetchRefs } from '../api/refs.js'
import RevisionCombobox from './RevisionCombobox.vue'

const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()

function readRevFromRoute(): string {
  const raw = route.query.rev
  return typeof raw === 'string' && raw !== '' ? raw : 'HEAD'
}

function readPathFromRoute(): string | null {
  const raw = route.query.path
  return typeof raw === 'string' && raw !== '' ? raw : null
}

const currentRev = ref<string>(readRevFromRoute())
const currentPath = ref<string | null>(readPathFromRoute())
const commits = ref<ReadonlyArray<CommitDto>>([])
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref<string | null>(null)
const initialRefs = ref<RefListDto | null>(null)

let isUnmounted = false
let generation = 0

/**
 * 短縮 SHA を返す。
 */
function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

/**
 * ISO 8601 日時を表示用に整形する。
 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * コミット一覧を取得する (初回読み込み)。
 */
async function loadCommits(rev: string, path: string | null): Promise<void> {
  const gen = ++generation
  loading.value = true
  errorMessage.value = null
  try {
    const result = await fetchCommits({ rev, after: null, limit: PAGE_SIZE, path })
    if (isUnmounted || gen !== generation) return
    commits.value = result.commits
    hasMore.value = result.hasMore
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
    commits.value = []
    hasMore.value = false
  } finally {
    if (!isUnmounted && gen === generation) {
      loading.value = false
    }
  }
}

/**
 * 「もっと読み込む」ボタンの処理。
 */
async function loadMore(): Promise<void> {
  const lastCommit = commits.value[commits.value.length - 1]
  if (lastCommit === undefined || loadingMore.value) return

  const gen = generation
  loadingMore.value = true
  try {
    const result = await fetchCommits({
      rev: currentRev.value,
      after: lastCommit.hash,
      limit: PAGE_SIZE,
      path: currentPath.value,
    })
    if (isUnmounted || gen !== generation) return
    commits.value = [...commits.value, ...result.commits]
    hasMore.value = result.hasMore
  } catch (err) {
    if (isUnmounted || gen !== generation) return
    errorMessage.value = err instanceof Error ? err.message : 'unknown error'
  } finally {
    if (!isUnmounted && gen === generation) {
      loadingMore.value = false
    }
  }
}

function onRevisionSubmit(rev: string): void {
  currentRev.value = rev
  const query: Record<string, string> = {}
  if (rev !== 'HEAD') {
    query.rev = rev
  }
  if (currentPath.value !== null) {
    query.path = currentPath.value
  }
  void router.push({ path: '/commits', query })
}

/**
 * diff ビューへの遷移 URL を生成する。
 */
function diffUrl(commit: CommitDto): string {
  const params = new URLSearchParams()
  params.set('from', `${commit.hash}^`)
  params.set('to', commit.hash)
  return `/diff?${params.toString()}`
}

/**
 * revision tree への遷移 URL を生成する。
 */
function treeUrl(commit: CommitDto): string {
  return `/tree?rev=${encodeURIComponent(commit.hash)}`
}

watch(
  () => route.query,
  () => {
    const rev = readRevFromRoute()
    const path = readPathFromRoute()
    if (rev !== currentRev.value || path !== currentPath.value) {
      currentRev.value = rev
      currentPath.value = path
      void loadCommits(rev, path)
    }
  },
)

onMounted(async () => {
  const [refsResult] = await Promise.all([
    fetchRefs(''),
    loadCommits(currentRev.value, currentPath.value),
  ])
  if (!isUnmounted) {
    initialRefs.value = refsResult
  }
})

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<template>
  <div class="commits-view">
    <Teleport to="#page-header-slot">
      <div class="commits-header">
        <label class="rev-label">
          Revision
          <RevisionCombobox
            :model-value="currentRev"
            :initial-refs="initialRefs"
            :allow-worktree="false"
            placeholder="HEAD"
            @update:model-value="currentRev = $event"
            @submit="onRevisionSubmit"
          />
        </label>
      </div>
    </Teleport>

    <p v-if="loading" class="status-message">loading...</p>
    <p v-else-if="errorMessage !== null" class="status-message error">{{ errorMessage }}</p>
    <template v-else>
      <p v-if="currentPath !== null" class="path-filter">
        path: <code>{{ currentPath }}</code>
      </p>
      <table v-if="commits.length > 0" class="commits-table">
        <thead>
          <tr>
            <th class="col-hash">SHA</th>
            <th class="col-message">Message</th>
            <th class="col-author">Author</th>
            <th class="col-date">Date</th>
            <th class="col-stats">Stats</th>
            <th class="col-links">Links</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="commit in commits" :key="commit.hash">
            <td class="col-hash">
              <code>{{ shortHash(commit.hash) }}</code>
              <span v-if="commit.parentCount >= 2" class="merge-badge">merge</span>
            </td>
            <td class="col-message">
              <span class="commit-subject">{{ commit.subject }}</span>
              <span v-if="commit.body !== ''" class="commit-body-indicator" :title="commit.body">
                ...
              </span>
            </td>
            <td class="col-author" :title="commit.authorEmail">
              {{ commit.authorName }}
            </td>
            <td class="col-date">{{ formatDate(commit.date) }}</td>
            <td class="col-stats">
              <span class="stat-files">{{ commit.stats.filesChanged }} files</span>
              <span v-if="commit.stats.insertions > 0" class="stat-add">
                +{{ commit.stats.insertions }}
              </span>
              <span v-if="commit.stats.deletions > 0" class="stat-del">
                -{{ commit.stats.deletions }}
              </span>
            </td>
            <td class="col-links">
              <router-link :to="diffUrl(commit)" class="link-btn">diff</router-link>
              <router-link :to="treeUrl(commit)" class="link-btn">tree</router-link>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="status-message">no commits found</p>

      <div v-if="hasMore" class="load-more">
        <button :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'loading...' : 'show more' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.commits-view {
  padding-bottom: 2rem;
}
.commits-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
}
.rev-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-fg-muted);
}
.path-filter {
  font-size: 0.85rem;
  color: var(--color-fg-muted);
}
.path-filter code {
  background: var(--color-bg-subtle);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-family: var(--font-mono);
}
.status-message {
  color: var(--color-fg-muted);
  font-size: 0.9rem;
}
.error {
  color: var(--color-error);
}
.commits-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.commits-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 2px solid var(--color-border);
  color: var(--color-fg-muted);
  font-weight: 600;
  white-space: nowrap;
}
.commits-table td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
.col-hash {
  white-space: nowrap;
}
.col-hash code {
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.merge-badge {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0.05rem 0.3rem;
  font-size: 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-fg-muted);
  vertical-align: middle;
}
.col-message {
  max-width: 0;
  width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-subject {
  color: var(--color-fg);
}
.commit-body-indicator {
  color: var(--color-fg-muted);
  margin-left: 0.3rem;
  cursor: help;
}
.col-author {
  white-space: nowrap;
  color: var(--color-fg-muted);
}
.col-date {
  white-space: nowrap;
  color: var(--color-fg-muted);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.col-stats {
  white-space: nowrap;
}
.stat-files {
  color: var(--color-fg-muted);
  margin-right: 0.3rem;
}
.stat-add {
  color: var(--color-diff-add-fg, #22863a);
  margin-right: 0.3rem;
}
.stat-del {
  color: var(--color-diff-del-fg, #cb2431);
}
.col-links {
  white-space: nowrap;
}
.link-btn {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  margin-right: 0.3rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-fg-muted);
  text-decoration: none;
  transition:
    background 0.15s,
    color 0.15s;
}
.link-btn:hover {
  background: var(--color-bg-subtle);
  color: var(--color-fg);
}
.load-more {
  text-align: center;
  padding: 1rem 0;
}
.load-more button {
  padding: 0.4rem 1.2rem;
  font-size: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-fg);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.load-more button:hover:not(:disabled) {
  background: var(--color-bg-subtle);
  border-color: var(--color-fg-muted);
}
.load-more button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
