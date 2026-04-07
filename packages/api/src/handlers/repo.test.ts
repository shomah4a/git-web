import { describe, expect, it } from 'vitest'
import type { GitClient } from '../git.js'
import { createRepoHandler } from './repo.js'

/**
 * GitClient のフェイク実装。
 * 副作用無しで固定値を返す。
 */
function createFakeGit(values: { head: string; repoRoot: string }): GitClient {
  return {
    head: () => Promise.resolve(values.head),
    repoRoot: () => Promise.resolve(values.repoRoot),
  }
}

describe('createRepoHandler', () => {
  it('repoRootとheadをRepoInfoとしてJSON返却する', async () => {
    const git = createFakeGit({
      head: '0123456789abcdef0123456789abcdef01234567',
      repoRoot: '/home/user/myrepo',
    })
    const handler = createRepoHandler(git)

    const response = await handler({ method: 'GET', url: '/api/repo' })

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    if (typeof response.body !== 'string') {
      throw new Error('expected string body for JSON response')
    }
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      cwd: '/home/user/myrepo',
      head: '0123456789abcdef0123456789abcdef01234567',
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
