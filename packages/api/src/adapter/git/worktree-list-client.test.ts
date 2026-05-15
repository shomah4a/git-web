import { describe, expect, it } from 'vitest'
import type { WorktreeListExecFn } from './worktree-list-client.js'
import { WorktreeListClient } from './worktree-list-client.js'

/**
 * `WorktreeListClient` の薄い adapter テスト。
 *
 * - execFile は注入式で fake に差し替えて、引数 / env / cwd を検証する
 * - パース挙動自体は `worktree-list-parser.test.ts` で網羅済み
 */

type Call = {
  file: string
  args: ReadonlyArray<string>
  cwd: string
  env: NodeJS.ProcessEnv
}

function createFakeExec(stdout: string): {
  fn: WorktreeListExecFn
  calls: Call[]
} {
  const calls: Call[] = []
  const fn: WorktreeListExecFn = (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd, env: options.env })
    return Promise.resolve({ stdout })
  }
  return { fn, calls }
}

describe('WorktreeListClient.listWorktrees', () => {
  it('git worktree list --porcelain を指定 cwd と LC_ALL=C で呼び出す', async () => {
    const { fn, calls } = createFakeExec('')
    const client = new WorktreeListClient('/tmp/repo', fn)

    await client.listWorktrees()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.file).toBe('git')
    expect(calls[0]?.args).toEqual(['worktree', 'list', '--porcelain'])
    expect(calls[0]?.cwd).toBe('/tmp/repo')
    expect(calls[0]?.env.LC_ALL).toBe('C')
    expect(calls[0]?.env.LANG).toBe('C')
  })

  it('stdout をパースして WorktreeInfo 配列を返す', async () => {
    const stdout =
      'worktree /tmp/repo\n' +
      'HEAD 1111111111111111111111111111111111111111\n' +
      'branch refs/heads/main\n' +
      '\n' +
      'worktree /tmp/repo/.worktrees/feat\n' +
      'HEAD 2222222222222222222222222222222222222222\n' +
      'branch refs/heads/feat/x\n' +
      '\n'

    const { fn } = createFakeExec(stdout)
    const client = new WorktreeListClient('/tmp/repo', fn)

    const result = await client.listWorktrees()
    expect(result).toHaveLength(2)
    expect(result[0]?.path).toBe('/tmp/repo')
    expect(result[1]?.branchRef).toBe('refs/heads/feat/x')
  })
})
