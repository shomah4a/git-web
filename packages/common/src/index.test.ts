import { describe, expect, it } from 'vitest'
import type { RepoInfoDto } from './index.js'

describe('RepoInfoDto型', () => {
  it('cwdとheadフィールドを文字列として保持できる', () => {
    const info: RepoInfoDto = {
      cwd: '/tmp/example-repo',
      head: '0123456789abcdef0123456789abcdef01234567',
    }

    expect(info.cwd).toBe('/tmp/example-repo')
    expect(info.head).toBe('0123456789abcdef0123456789abcdef01234567')
  })
})
