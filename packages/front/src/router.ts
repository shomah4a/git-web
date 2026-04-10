/**
 * Vue Router 設定 (ADR 0022)。
 *
 * - history mode を使用 (createWebHistory)
 * - TreeView / DiffView は lazy import で code split する
 */

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'tree',
      component: () => import('./components/TreeView.vue'),
    },
    {
      path: '/diff',
      name: 'diff',
      component: () => import('./components/DiffView.vue'),
    },
  ],
})

export default router
