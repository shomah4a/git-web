import { describe, expect, it } from 'vitest'
import { buildPageTitle, type TitleInput } from './build-page-title.js'

function input(overrides: Partial<TitleInput> = {}): TitleInput {
  return {
    routeName: undefined,
    queryRev: undefined,
    queryPath: undefined,
    queryFrom: undefined,
    queryTo: undefined,
    ...overrides,
  }
}

describe('buildPageTitle', () => {
  it('repoNameがnullの場合はフォールバックタイトルを返す', () => {
    expect(buildPageTitle(null, input())).toBe('git-web')
  })

  describe('worktree /', () => {
    it('パス未指定の場合は / を表示する', () => {
      expect(buildPageTitle('my-repo', input({ routeName: 'worktree' }))).toBe(
        'my-repo:(worktree) / - git-web',
      )
    })

    it('パス指定ありの場合はそのパスを表示する', () => {
      expect(
        buildPageTitle('my-repo', input({ routeName: 'worktree', queryPath: 'src/components' })),
      ).toBe('my-repo:(worktree) /src/components - git-web')
    })
  })

  describe('worktree-blob /wt/blob', () => {
    it('ファイルパスを表示する', () => {
      expect(
        buildPageTitle('my-repo', input({ routeName: 'worktree-blob', queryPath: 'src/main.ts' })),
      ).toBe('my-repo:(worktree) /src/main.ts - git-web')
    })
  })

  describe('revision-tree /tree', () => {
    it('revとパスを表示する', () => {
      expect(
        buildPageTitle(
          'my-repo',
          input({ routeName: 'revision-tree', queryRev: 'main', queryPath: 'src' }),
        ),
      ).toBe('my-repo:main /src - git-web')
    })

    it('rev未指定の場合はHEADを表示する', () => {
      expect(buildPageTitle('my-repo', input({ routeName: 'revision-tree' }))).toBe(
        'my-repo:HEAD / - git-web',
      )
    })
  })

  describe('blob /blob', () => {
    it('revとファイルパスを表示する', () => {
      expect(
        buildPageTitle(
          'my-repo',
          input({ routeName: 'blob', queryRev: 'abc1234', queryPath: 'README.md' }),
        ),
      ).toBe('my-repo:abc1234 /README.md - git-web')
    })
  })

  describe('diff /diff', () => {
    it('fromとtoを表示する', () => {
      expect(
        buildPageTitle(
          'my-repo',
          input({ routeName: 'diff', queryFrom: 'HEAD', queryTo: '(worktree)' }),
        ),
      ).toBe('my-repo diff HEAD..(worktree) - git-web')
    })

    it('from/to未指定の場合はデフォルト値を使用する', () => {
      expect(buildPageTitle('my-repo', input({ routeName: 'diff' }))).toBe(
        'my-repo diff HEAD..(worktree) - git-web',
      )
    })
  })

  describe('パスの先頭スラッシュ', () => {
    it('スラッシュ始まりのパスはそのまま使用する', () => {
      expect(
        buildPageTitle(
          'my-repo',
          input({ routeName: 'blob', queryRev: 'main', queryPath: '/src/main.ts' }),
        ),
      ).toBe('my-repo:main /src/main.ts - git-web')
    })
  })
})
