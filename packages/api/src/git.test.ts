import { describe, expect, it } from 'vitest'
import type { GitResult, GitRunner } from './git.js'
import { getHead, getRepoRoot } from './git.js'

/**
 * 渡された引数を記録しつつ、固定の stdout/stderr を返すフェイク runner。
 */
function createFakeRunner(stdout: string): {
  runner: GitRunner
  calls: Array<{ args: ReadonlyArray<string>; cwd: string }>
} {
  const calls: Array<{ args: ReadonlyArray<string>; cwd: string }> = []
  const runner: GitRunner = async (args, cwd): Promise<GitResult> => {
    calls.push({ args, cwd })
    return { stdout, stderr: '' }
  }
  return { runner, calls }
}

describe('getHead関数', () => {
  it('rev-parse HEADを呼び出して結果を返す', async () => {
    const { runner, calls } = createFakeRunner('abc1234\n')

    const head = await getHead(runner, '/tmp/repo')

    expect(head).toBe('abc1234')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual(['rev-parse', 'HEAD'])
    expect(calls[0]?.cwd).toBe('/tmp/repo')
  })

  it('末尾の改行を取り除く', async () => {
    const { runner } = createFakeRunner('  0123456789\n\n')

    const head = await getHead(runner, '/tmp/repo')

    expect(head).toBe('0123456789')
  })
})

describe('getRepoRoot関数', () => {
  it('rev-parse --show-toplevelを呼び出して結果を返す', async () => {
    const { runner, calls } = createFakeRunner('/home/user/myrepo\n')

    const root = await getRepoRoot(runner, '/home/user/myrepo/sub/dir')

    expect(root).toBe('/home/user/myrepo')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual(['rev-parse', '--show-toplevel'])
    expect(calls[0]?.cwd).toBe('/home/user/myrepo/sub/dir')
  })
})
