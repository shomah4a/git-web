import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FROM,
  DEFAULT_TO,
  WORKTREE_SENTINEL,
  buildDiffRangeSearch,
  pushDiffRangeToUrl,
  readDiffRangeFromSearch,
} from './url-state.js'

describe('readDiffRangeFromSearch', () => {
  it('空文字はデフォルトに倒す', () => {
    expect(readDiffRangeFromSearch('')).toEqual({ from: 'HEAD', to: WORKTREE_SENTINEL })
  })

  it('先頭の疑問符有りでも解釈できる', () => {
    expect(readDiffRangeFromSearch('?from=main&to=feature/x')).toEqual({
      from: 'main',
      to: 'feature/x',
    })
  })

  it('先頭の疑問符無しでも解釈できる', () => {
    expect(readDiffRangeFromSearch('from=main')).toEqual({
      from: 'main',
      to: WORKTREE_SENTINEL,
    })
  })

  it('from のみ指定されたとき to はデフォルト', () => {
    expect(readDiffRangeFromSearch('?from=main')).toEqual({ from: 'main', to: WORKTREE_SENTINEL })
  })

  it('to のみ指定されたとき from はデフォルト', () => {
    expect(readDiffRangeFromSearch('?to=release-1')).toEqual({ from: 'HEAD', to: 'release-1' })
  })

  it('空文字の値はデフォルトに倒す', () => {
    expect(readDiffRangeFromSearch('?from=&to=')).toEqual({ from: 'HEAD', to: WORKTREE_SENTINEL })
  })

  it('URL エンコードされた slash を含む ref を復元できる', () => {
    expect(readDiffRangeFromSearch('?from=feature%2Fx&to=release%2F1')).toEqual({
      from: 'feature/x',
      to: 'release/1',
    })
  })

  it('worktree 文字列も保持する', () => {
    expect(readDiffRangeFromSearch('?from=HEAD&to=%28worktree%29')).toEqual({
      from: 'HEAD',
      to: WORKTREE_SENTINEL,
    })
  })
})

describe('buildDiffRangeSearch', () => {
  it('デフォルト状態は空文字を返す', () => {
    expect(buildDiffRangeSearch({ from: DEFAULT_FROM, to: DEFAULT_TO })).toBe('')
  })

  it('from のみがデフォルトから変わったとき from キーだけ出す', () => {
    expect(buildDiffRangeSearch({ from: 'main', to: DEFAULT_TO })).toBe('?from=main')
  })

  it('to のみがデフォルトから変わったとき to キーだけ出す', () => {
    expect(buildDiffRangeSearch({ from: DEFAULT_FROM, to: 'v1' })).toBe('?to=v1')
  })

  it('両方変わったとき from to の順で両方出す', () => {
    expect(buildDiffRangeSearch({ from: 'a', to: 'b' })).toBe('?from=a&to=b')
  })

  it('slash を含む ref を URL エンコードして出す', () => {
    expect(buildDiffRangeSearch({ from: 'feature/x', to: 'release/1' })).toBe(
      '?from=feature%2Fx&to=release%2F1',
    )
  })
})

describe('pushDiffRangeToUrl', () => {
  type FakeHistoryCall = { readonly state: unknown; readonly title: string; readonly url: string }

  type FakeHistory = {
    readonly history: { pushState(state: unknown, title: string, url: string): void }
    readonly calls: FakeHistoryCall[]
  }

  function createFakeHistory(): FakeHistory {
    const calls: FakeHistoryCall[] = []
    const history = {
      pushState(state: unknown, title: string, url: string) {
        calls.push({ state, title, url })
      },
    }
    return { history, calls }
  }

  function createFakeLocation(
    pathname: string,
    search: string,
    hash: string,
  ): { readonly pathname: string; readonly search: string; readonly hash: string } {
    return { pathname, search, hash }
  }

  it('差分があれば pushState を呼ぶ', () => {
    const { history, calls } = createFakeHistory()
    const location = createFakeLocation('/', '', '')

    pushDiffRangeToUrl(history, location, { from: 'main', to: DEFAULT_TO })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/?from=main')
  })

  it('現在 URL と同じ range のとき pushState を呼ばない', () => {
    const { history, calls } = createFakeHistory()
    const location = createFakeLocation('/', '?from=main', '')

    pushDiffRangeToUrl(history, location, { from: 'main', to: DEFAULT_TO })

    expect(calls).toHaveLength(0)
  })

  it('デフォルト状態へ戻すとき query を空にする', () => {
    const { history, calls } = createFakeHistory()
    const location = createFakeLocation('/foo', '?from=main', '')

    pushDiffRangeToUrl(history, location, { from: DEFAULT_FROM, to: DEFAULT_TO })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/foo')
  })

  it('pathname と hash を維持する', () => {
    const { history, calls } = createFakeHistory()
    const location = createFakeLocation('/app/diff', '', '#diff-file-foo')

    pushDiffRangeToUrl(history, location, { from: 'a', to: 'b' })

    expect(calls[0]?.url).toBe('/app/diff?from=a&to=b#diff-file-foo')
  })
})
