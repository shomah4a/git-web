/**
 * Vue Router 設定 (ADR 0022, ADR 0023, ADR 0028)。
 *
 * - history mode を使用 (createWebHistory)
 * - 各画面は lazy import で code split する
 */

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'worktree',
      component: () => import('./components/WorktreeView.vue'),
    },
    {
      path: '/tree',
      name: 'revision-tree',
      component: () => import('./components/RevisionTreeView.vue'),
    },
    {
      path: '/blob',
      name: 'blob',
      component: () => import('./components/BlobView.vue'),
    },
    {
      path: '/diff',
      name: 'diff',
      component: () => import('./components/DiffView.vue'),
    },
  ],
})

export default router
