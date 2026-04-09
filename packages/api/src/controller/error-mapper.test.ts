import { describe, expect, it } from 'vitest'
import {
  InvalidDiffPathError,
  InvalidDiffRangeError,
  InvalidRevisionError,
  NotAGitRepositoryError,
} from '../domain/errors.js'
import { mapDomainErrorToHttpResponse } from './error-mapper.js'

function parseJsonBody(body: string | Uint8Array): unknown {
  if (typeof body !== 'string') {
    throw new Error('expected string body')
  }
  const parsed: unknown = JSON.parse(body)
  return parsed
}

describe('mapDomainErrorToHttpResponse', () => {
  it('InvalidRevisionError は 400 invalid_revision に変換される', () => {
    const err = new InvalidRevisionError('bad-rev', 'shape')

    const response = mapDomainErrorToHttpResponse(err)

    expect(response).not.toBeNull()
    if (response === null) throw new Error('expected non-null')
    expect(response.status).toBe(400)
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(parseJsonBody(response.body)).toEqual({
      error: 'invalid_revision',
      message: 'invalid revision (shape): bad-rev',
    })
  })

  it('InvalidDiffRangeError は 400 invalid_diff_range に変換される', () => {
    const err = new InvalidDiffRangeError('to specified without from')

    const response = mapDomainErrorToHttpResponse(err)

    expect(response).not.toBeNull()
    if (response === null) throw new Error('expected non-null')
    expect(response.status).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({
      error: 'invalid_diff_range',
      message: 'invalid diff range: to specified without from',
    })
  })

  it('InvalidDiffPathError は 400 invalid_diff_path に変換される', () => {
    const err = new InvalidDiffPathError('../foo', 'contains ..')

    const response = mapDomainErrorToHttpResponse(err)

    expect(response).not.toBeNull()
    if (response === null) throw new Error('expected non-null')
    expect(response.status).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({
      error: 'invalid_diff_path',
      message: 'invalid diff path: contains ..',
    })
  })

  it('NotAGitRepositoryError は 500 not_a_git_repository に変換される', () => {
    const err = new NotAGitRepositoryError('/tmp/foo')

    const response = mapDomainErrorToHttpResponse(err)

    expect(response).not.toBeNull()
    if (response === null) throw new Error('expected non-null')
    expect(response.status).toBe(500)
    expect(parseJsonBody(response.body)).toEqual({
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
