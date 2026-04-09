import { describe, expect, it } from 'vitest'
import {
  DomainError,
  InvalidDiffPathError,
  InvalidRevisionError,
  NotAGitRepositoryError,
} from './errors.js'

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

describe('InvalidRevisionError', () => {
  it('messageにinvalid revisionプレフィックスとreasonとinput文字列が含まれる', () => {
    const err = new InvalidRevisionError('bad-rev', 'shape')

    expect(err.message).toBe('invalid revision (shape): bad-rev')
  })

  it('inputとreasonプロパティが保持される', () => {
    const err = new InvalidRevisionError('bad-rev', 'forbidden-chars')

    expect(err.input).toBe('bad-rev')
    expect(err.reason).toBe('forbidden-chars')
  })

  it('DomainErrorを継承している', () => {
    const err = new InvalidRevisionError('bad-rev', 'shape')

    expect(err).toBeInstanceOf(DomainError)
  })
})

describe('InvalidDiffPathError', () => {
  it('messageにinvalid diff pathプレフィックスとreasonが含まれる', () => {
    const err = new InvalidDiffPathError('../foo', 'contains dotdot')

    expect(err.message).toBe('invalid diff path: contains dotdot')
  })

  it('inputとreasonプロパティが保持される', () => {
    const err = new InvalidDiffPathError('../foo', 'contains dotdot')

    expect(err.input).toBe('../foo')
    expect(err.reason).toBe('contains dotdot')
  })

  it('DomainErrorを継承している', () => {
    const err = new InvalidDiffPathError('/abs', 'absolute path')

    expect(err).toBeInstanceOf(DomainError)
  })
})
