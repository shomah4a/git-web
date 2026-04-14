import { describe, expect, it } from 'vitest'
import type { GitClient } from '../domain/ports/git-client.js'
import type { HeadInfo } from '../domain/repo.js'
import { createRepoHandler } from './repo-controller.js'

/**
 * GitClient のフェイク実装。
 * 副作用無しで固定値を返す。
 */
function createFakeGit(values: { head: HeadInfo; repoRoot: string }): GitClient {
  return {
    head: () => Promise.resolve(values.head),
    repoRoot: () => Promise.resolve(values.repoRoot),
  }
}

describe('createRepoHandler', () => {
  it('repoRootとheadをRepoInfoDtoのJSONとして200で返す', async () => {
    const git = createFakeGit({
      head: { commitHash: '0123456', branch: 'main' },
      repoRoot: '/home/user/myrepo',
    })
    const handler = createRepoHandler(git)

    const response = await handler({ method: 'GET', url: '/api/repo' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers?.['cache-control']).toBe('no-store')
    if (typeof response.body !== 'string') {
      throw new Error('expected string body for JSON response')
    }
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      cwd: '/home/user/myrepo',
      head: { commitHash: '0123456', branch: 'main' },
    })
  })

  it('GitClientが例外を投げた場合はその例外を伝播させる', async () => {
    const git: GitClient = {
      head: () => Promise.reject(new Error('not a git repo')),
      repoRoot: () => Promise.reject(new Error('not a git repo')),
    }
    const handler = createRepoHandler(git)

    await expect(handler({ method: 'GET', url: '/api/repo' })).rejects.toThrow('not a git repo')
  })
})
