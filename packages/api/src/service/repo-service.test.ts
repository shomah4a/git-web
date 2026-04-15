import { describe, expect, it } from 'vitest'
import type { GitClient } from '../domain/ports/git-client.js'
import type { HeadInfo } from '../domain/repo.js'
import { getRepoInfo } from './repo-service.js'

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

describe('getRepoInfo', () => {
  it('GitClientのrepoRootとheadをRepoInfoドメインモデルに詰めて返す', async () => {
    const git = createFakeGit({
      head: { commitHash: '0123456', branch: 'main' },
      repoRoot: '/home/user/myrepo',
    })

    const info = await getRepoInfo(git)

    expect(info).toEqual({
      name: 'myrepo',
      cwd: '/home/user/myrepo',
      head: { commitHash: '0123456', branch: 'main' },
    })
  })

  it('repoRootがルートディレクトリの場合はcwdをnameとして使用する', async () => {
    const git = createFakeGit({
      head: { commitHash: '0123456', branch: 'main' },
      repoRoot: '/',
    })

    const info = await getRepoInfo(git)

    expect(info).toEqual({
      name: '/',
      cwd: '/',
      head: { commitHash: '0123456', branch: 'main' },
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
