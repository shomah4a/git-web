import { describe, expect, it } from 'vitest'
import { NotAGitRepositoryError } from '../domain/errors.js'
import { mapDomainErrorToHttpResponse } from './error-mapper.js'

describe('mapDomainErrorToHttpResponse', () => {
  it('NotAGitRepositoryErrorは500とエラーJSONに変換される', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    const response = mapDomainErrorToHttpResponse(err)

    expect(response).not.toBeNull()
    if (response === null) {
      throw new Error('expected non-null response')
    }
    expect(response.status).toBe(500)
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    if (typeof response.body !== 'string') {
      throw new Error('expected string body')
    }
    const parsed: unknown = JSON.parse(response.body)
    expect(parsed).toEqual({
      error: 'not_a_git_repository',
      message: 'not a git repository: /tmp/foo',
    })
  })

  it('想定外のErrorに対してはnullを返す', () => {
    const response = mapDomainErrorToHttpResponse(new Error('unknown'))

    expect(response).toBeNull()
  })

  it('Error以外の値に対してもnullを返す', () => {
    expect(mapDomainErrorToHttpResponse('string error')).toBeNull()
    expect(mapDomainErrorToHttpResponse(undefined)).toBeNull()
    expect(mapDomainErrorToHttpResponse({ code: 1 })).toBeNull()
  })
})
