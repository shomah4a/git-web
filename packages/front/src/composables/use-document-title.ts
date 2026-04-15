/**
 * ページ遷移時に document.title を動的に更新する composable (ADR 0041)。
 *
 * - router.afterEach でルート変更を検知してタイトルを更新する
 * - repoName が null（API 未応答）の場合はフォールバックタイトルを返す
 * - repoName が取得された時点で現在のルートに基づいてタイトルを再設定する
 */

import type { Ref } from 'vue'
import { watch } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { buildPageTitle, type TitleInput } from './build-page-title.js'

function toQueryString(value: string | string[] | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return Array.isArray(value) ? value[0] : value
}

function routeToTitleInput(route: RouteLocationNormalized): TitleInput {
  return {
    routeName: typeof route.name === 'string' ? route.name : undefined,
    queryRev: toQueryString(route.query.rev as string | string[] | undefined),
    queryPath: toQueryString(route.query.path as string | string[] | undefined),
    queryFrom: toQueryString(route.query.from as string | string[] | undefined),
    queryTo: toQueryString(route.query.to as string | string[] | undefined),
  }
}

/**
 * document.title をルート遷移に応じて更新する。
 *
 * @param router - Vue Router インスタンス
 * @param repoName - リポジトリ名の ref（API 応答前は null）
 * @param setTitle - document.title への書き込み関数（テスト時に差し替え可能）
 */
export function useDocumentTitle(
  router: Router,
  repoName: Ref<string | null>,
  setTitle: (title: string) => void = (t) => {
    document.title = t
  },
): void {
  router.afterEach((to) => {
    const input = routeToTitleInput(to)
    setTitle(buildPageTitle(repoName.value, input))
  })

  watch(repoName, (name) => {
    if (name === null) {
      return
    }
    const input = routeToTitleInput(router.currentRoute.value)
    setTitle(buildPageTitle(name, input))
  })
}
