import { describe, expect, it } from 'vitest'
import type { GitClient } from '../domain/ports/git-client.js'
import { getRepoInfo } from './repo-service.js'

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

describe('getRepoInfo', () => {
  it('GitClientのrepoRootとheadをRepoInfoドメインモデルに詰めて返す', async () => {
    const git = createFakeGit({
      head: '0123456789abcdef0123456789abcdef01234567',
      repoRoot: '/home/user/myrepo',
    })

    const info = await getRepoInfo(git)

    expect(info).toEqual({
      cwd: '/home/user/myrepo',
      head: '0123456789abcdef0123456789abcdef01234567',
    })
  })

  it('GitClientが例外を投げた場合はその例外を伝播させる', async () => {
    const git: GitClient = {
      head: () => Promise.reject(new Error('boom')),
      repoRoot: () => Promise.reject(new Error('boom')),
    }

    await expect(getRepoInfo(git)).rejects.toThrow('boom')
  })
})
