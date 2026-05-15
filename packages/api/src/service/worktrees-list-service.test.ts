import { describe, expect, it } from 'vitest'
import type { GitWorktreeListClient } from '../domain/ports/git-worktree-list-client.js'
import type { WorktreeInfo } from '../domain/worktree-info.js'
import {
  createWorktreesListService,
  isValidWorktreeName,
  type RealpathFn,
} from './worktrees-list-service.js'

function fakeClient(items: ReadonlyArray<WorktreeInfo>): GitWorktreeListClient {
  return {
    listWorktrees: () => Promise.resolve(items),
  }
}

const identityRealpath: RealpathFn = (p) => Promise.resolve(p)

describe('isValidWorktreeName', () => {
  it('英数字 + . _ - は受理する', () => {
    expect(isValidWorktreeName('main')).toBe(true)
    expect(isValidWorktreeName('feat-x.y_z')).toBe(true)
  })

  it('日本語の basename を受理する (URL は percent-encode 前提)', () => {
    expect(isValidWorktreeName('機能追加')).toBe(true)
  })

  it('/ や .. を含む文字列を拒否する', () => {
    expect(isValidWorktreeName('a/b')).toBe(false)
    expect(isValidWorktreeName('..')).toBe(false)
    expect(isValidWorktreeName('a..b')).toBe(false)
    expect(isValidWorktreeName('a\\b')).toBe(false)
    expect(isValidWorktreeName('a\0b')).toBe(false)
  })

  it('空文字 / 制御文字を拒否する', () => {
    expect(isValidWorktreeName('')).toBe(false)
    expect(isValidWorktreeName('a\nb')).toBe(false)
    expect(isValidWorktreeName('a\tb')).toBe(false)
  })

  it('256 文字を超える文字列を拒否する', () => {
    expect(isValidWorktreeName('a'.repeat(256))).toBe(true)
    expect(isValidWorktreeName('a'.repeat(257))).toBe(false)
  })
})

describe('createWorktreesListService.listWorktrees', () => {
  const baseInfo = (overrides: Partial<WorktreeInfo>): WorktreeInfo => ({
    path: '/tmp/repo',
    headHash: '1111111111111111111111111111111111111111',
    branchRef: 'refs/heads/main',
    isDetached: false,
    isBare: false,
    isLocked: false,
    isPrunable: false,
    ...overrides,
  })

  it('main worktree 1 件をそのまま返す (isMain=true, isDefault=true)', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([baseInfo({ path: '/tmp/repo' })]),
      realpath: identityRealpath,
      defaultWorktreePath: '/tmp/repo',
    })

    const result = await svc.listWorktrees()
    expect(result).toEqual([
      {
        name: 'repo',
        path: '/tmp/repo',
        headHash: '1111111111111111111111111111111111111111',
        branchRef: 'refs/heads/main',
        isDetached: false,
        isDefault: true,
        isMain: true,
      },
    ])
  })

  it('linked worktree を含む複数件を返す (先頭が isMain)', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([
        baseInfo({ path: '/tmp/repo' }),
        baseInfo({
          path: '/tmp/repo/.worktrees/feat-x',
          headHash: '2222222222222222222222222222222222222222',
          branchRef: 'refs/heads/feat/x',
        }),
      ]),
      realpath: identityRealpath,
      defaultWorktreePath: '/tmp/repo',
    })

    const result = await svc.listWorktrees()
    expect(result).toHaveLength(2)
    expect(result[0]?.isMain).toBe(true)
    expect(result[1]?.isMain).toBe(false)
    expect(result[1]?.name).toBe('feat-x')
    expect(result[1]?.isDefault).toBe(false)
  })

  it('bare worktree を除外する', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([
        baseInfo({ path: '/tmp/bare-parent', isBare: true }),
        baseInfo({ path: '/tmp/repo' }),
      ]),
      realpath: identityRealpath,
      defaultWorktreePath: '/tmp/repo',
    })

    const result = await svc.listWorktrees()
    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe('/tmp/repo')
    // bare 除外後の先頭が isMain=true
    expect(result[0]?.isMain).toBe(true)
  })

  it('realpath 失敗エントリは除外する', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([baseInfo({ path: '/tmp/repo' }), baseInfo({ path: '/tmp/gone' })]),
      realpath: (p) =>
        p === '/tmp/gone' ? Promise.reject(new Error('ENOENT')) : Promise.resolve(p),
      defaultWorktreePath: '/tmp/repo',
    })

    const result = await svc.listWorktrees()
    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe('/tmp/repo')
  })

  it('basename が衝突した worktree は全員に hash サフィックスが付く', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([
        baseInfo({ path: '/tmp/a/feat' }),
        baseInfo({ path: '/tmp/b/feat' }),
        baseInfo({ path: '/tmp/c/other' }),
      ]),
      realpath: identityRealpath,
      defaultWorktreePath: '/tmp/a/feat',
    })

    const result = await svc.listWorktrees()
    expect(result).toHaveLength(3)
    // 衝突した 2 件は -<hash> が付く
    expect(result[0]?.name).toMatch(/^feat-[0-9a-f]{8}$/)
    expect(result[1]?.name).toMatch(/^feat-[0-9a-f]{8}$/)
    expect(result[0]?.name).not.toBe(result[1]?.name)
    // 衝突しない 1 件は basename そのまま
    expect(result[2]?.name).toBe('other')
  })

  it('default の判定は realpath 後の絶対パスで一致比較される', async () => {
    const svc = createWorktreesListService({
      client: fakeClient([baseInfo({ path: '/tmp/symlink-to-repo' })]),
      realpath: (p) => Promise.resolve(p === '/tmp/symlink-to-repo' ? '/tmp/real-repo' : p),
      defaultWorktreePath: '/tmp/real-repo',
    })

    const result = await svc.listWorktrees()
    expect(result[0]?.path).toBe('/tmp/real-repo')
    expect(result[0]?.isDefault).toBe(true)
  })
})
