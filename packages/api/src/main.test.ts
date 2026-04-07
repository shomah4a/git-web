/**
 * start() のエラー経路に関する回帰テスト。
 *
 * 設計方針:
 * - リファクタの前後で「リポジトリ外で start() を呼んだ際の例外型と
 *   message 文字列」が変わらないことを保証する
 * - 一時ディレクトリを mkdtemp で作成し、git 管理下にないことを担保する
 * - HTTP リスナーは起動しない (例外がリスナー作成前に投げられる)
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotAGitRepositoryError } from './domain/errors.js'
import { start } from './main.js'

let nonRepoDir: string

beforeEach(async () => {
  nonRepoDir = await mkdtemp(join(tmpdir(), 'git-web-start-test-'))
})

afterEach(async () => {
  await rm(nonRepoDir, { recursive: true, force: true })
})

describe('start', () => {
  it('リポジトリ外のディレクトリで起動しようとするとNotAGitRepositoryErrorが投げられる', async () => {
    await expect(start({ cwd: nonRepoDir })).rejects.toBeInstanceOf(NotAGitRepositoryError)
  })

  it('リポジトリ外のディレクトリで起動するとmessageが従来の文字列形式と一致する', async () => {
    await expect(start({ cwd: nonRepoDir })).rejects.toThrow(`not a git repository: ${nonRepoDir}`)
  })
})
