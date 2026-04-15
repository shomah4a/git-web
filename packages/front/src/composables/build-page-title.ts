/**
 * ページタイトル文字列を組み立てる純粋関数 (ADR 0041)。
 *
 * フォーマット: `${repoName}:${rev} ${path} - git-web`
 * diff ルートのみ: `${repoName} diff ${from}..${to} - git-web`
 */

/** ルート情報からタイトルを組み立てるために必要な入力。 */
export type TitleInput = {
  readonly routeName: string | undefined
  readonly queryRev: string | undefined
  readonly queryPath: string | undefined
  readonly queryFrom: string | undefined
  readonly queryTo: string | undefined
}

const SUFFIX = ' - git-web'
const FALLBACK = 'git-web'

/**
 * リポジトリ名とルート情報からページタイトルを組み立てる。
 * repoName が null の場合（API 未応答）はフォールバックタイトルを返す。
 */
export function buildPageTitle(repoName: string | null, input: TitleInput): string {
  if (repoName === null) {
    return FALLBACK
  }

  const { routeName } = input

  if (routeName === 'diff') {
    return buildDiffTitle(repoName, input)
  }

  const rev = resolveRev(routeName, input.queryRev)
  const displayPath = resolveDisplayPath(input.queryPath)

  return `${repoName}:${rev} ${displayPath}${SUFFIX}`
}

function resolveRev(routeName: string | undefined, queryRev: string | undefined): string {
  if (routeName === 'worktree' || routeName === 'worktree-blob') {
    return '(worktree)'
  }
  return queryRev ?? 'HEAD'
}

function resolveDisplayPath(queryPath: string | undefined): string {
  const p = queryPath ?? ''
  if (p === '') {
    return '/'
  }
  return p.startsWith('/') ? p : `/${p}`
}

function buildDiffTitle(repoName: string, input: TitleInput): string {
  const from = input.queryFrom ?? 'HEAD'
  const to = input.queryTo ?? '(worktree)'
  return `${repoName} diff ${from}..${to}${SUFFIX}`
}
