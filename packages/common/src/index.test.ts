import { describe, expect, it } from 'vitest'
import type { RepoInfoDto } from './index.js'

describe('RepoInfoDto型', () => {
  it('cwdとhead(commitHash+branch)を保持できる', () => {
    const info: RepoInfoDto = {
      cwd: '/tmp/example-repo',
      head: { commitHash: '0123456', branch: 'main' },
    }

    expect(info.cwd).toBe('/tmp/example-repo')
    expect(info.head.commitHash).toBe('0123456')
    expect(info.head.branch).toBe('main')
  })

  it('detached HEADではbranchがnullになる', () => {
    const info: RepoInfoDto = {
      cwd: '/tmp/example-repo',
      head: { commitHash: '0123456', branch: null },
    }

    expect(info.head.branch).toBeNull()
  })
})
