import { describe, expect, it } from 'vitest'
import { parseWorktreeListPorcelain } from './worktree-list-parser.js'

describe('parseWorktreeListPorcelain', () => {
  it('空文字列は空配列を返す', () => {
    expect(parseWorktreeListPorcelain('')).toEqual([])
  })

  it('main worktree 1 件をパースできる', () => {
    const input =
      'worktree /home/user/project\n' +
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/main\n' +
      '\n'

    expect(parseWorktreeListPorcelain(input)).toEqual([
      {
        path: '/home/user/project',
        headHash: 'abcdef0123456789abcdef0123456789abcdef01',
        branchRef: 'refs/heads/main',
        isDetached: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ])
  })

  it('main + linked worktree の複数セクションをパースできる', () => {
    const input =
      'worktree /home/user/project\n' +
      'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' +
      'branch refs/heads/main\n' +
      '\n' +
      'worktree /home/user/project/.worktrees/feat-x\n' +
      'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' +
      'branch refs/heads/feat/x\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(2)
    expect(result[0]?.path).toBe('/home/user/project')
    expect(result[1]?.path).toBe('/home/user/project/.worktrees/feat-x')
    expect(result[1]?.branchRef).toBe('refs/heads/feat/x')
  })

  it('detached HEAD は detached フラグが立つ', () => {
    const input =
      'worktree /home/user/project/.worktrees/inspect\n' +
      'HEAD ccccccccccccccccccccccccccccccccccccccccc\n' +
      'detached\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/home/user/project/.worktrees/inspect',
      headHash: 'ccccccccccccccccccccccccccccccccccccccccc',
      branchRef: null,
      isDetached: true,
      isBare: false,
      isLocked: false,
      isPrunable: false,
    })
  })

  it('bare worktree は isBare が立つ', () => {
    const input = 'worktree /home/user/bare.git\n' + 'bare\n' + '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]?.isBare).toBe(true)
    expect(result[0]?.headHash).toBeNull()
    expect(result[0]?.branchRef).toBeNull()
  })

  it('locked / prunable 行を読み取れる (reason 付きと無しの両方)', () => {
    const input =
      'worktree /tmp/a\n' +
      'HEAD 1111111111111111111111111111111111111111\n' +
      'branch refs/heads/a\n' +
      'locked\n' +
      '\n' +
      'worktree /tmp/b\n' +
      'HEAD 2222222222222222222222222222222222222222\n' +
      'branch refs/heads/b\n' +
      'locked reason text\n' +
      'prunable gitdir file points to non-existent location\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(2)
    expect(result[0]?.isLocked).toBe(true)
    expect(result[0]?.isPrunable).toBe(false)
    expect(result[1]?.isLocked).toBe(true)
    expect(result[1]?.isPrunable).toBe(true)
  })

  it('末尾改行が無くてもパースできる', () => {
    const input =
      'worktree /home/user/project\n' +
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/main'

    expect(parseWorktreeListPorcelain(input)).toHaveLength(1)
  })

  it('worktree 行を持たないセクションは破棄する', () => {
    const input =
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/orphan\n' +
      '\n' +
      'worktree /home/user/project\n' +
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/main\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe('/home/user/project')
  })

  it('未知のラベル行は握りつぶす', () => {
    const input =
      'worktree /home/user/project\n' +
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/main\n' +
      'worktreeOfSubmodule\n' +
      'unknownLabel some value\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe('/home/user/project')
    // 未知ラベルは Info に反映されない
    expect(result[0]?.isBare).toBe(false)
    expect(result[0]?.isDetached).toBe(false)
  })

  it('連続する空行は無視する', () => {
    const input =
      'worktree /a\n' +
      'HEAD 1111111111111111111111111111111111111111\n' +
      'branch refs/heads/a\n' +
      '\n\n\n' +
      'worktree /b\n' +
      'HEAD 2222222222222222222222222222222222222222\n' +
      'branch refs/heads/b\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result).toHaveLength(2)
  })

  it('worktree path に空白を含めることができる', () => {
    const input =
      'worktree /home/user/my project\n' +
      'HEAD abcdef0123456789abcdef0123456789abcdef01\n' +
      'branch refs/heads/main\n' +
      '\n'

    const result = parseWorktreeListPorcelain(input)
    expect(result[0]?.path).toBe('/home/user/my project')
  })
})
