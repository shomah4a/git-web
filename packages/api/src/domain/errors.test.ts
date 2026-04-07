import { describe, expect, it } from 'vitest'
import { DomainError, NotAGitRepositoryError } from './errors.js'

describe('DomainError', () => {
  it('nameにサブクラス名が入る', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    expect(err.name).toBe('NotAGitRepositoryError')
  })

  it('instanceof Errorが真になる', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    expect(err).toBeInstanceOf(Error)
  })

  it('instanceof DomainErrorが真になる', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    expect(err).toBeInstanceOf(DomainError)
  })
})

describe('NotAGitRepositoryError', () => {
  it('messageがnot a git repositoryプレフィックス付きで構築される', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    expect(err.message).toBe('not a git repository: /tmp/foo')
  })

  it('cwdプロパティに渡したパスが保持される', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    expect(err.cwd).toBe('/tmp/foo')
  })
})
