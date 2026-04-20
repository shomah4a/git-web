import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Logger } from './registry.js'
import {
  REGISTRY_FILE_NAME,
  createNodeRegistryIO,
  nodeHttpCheck,
  resolveRegistryDir,
} from './registry-io-node.js'

function makeLogger(): Logger {
  return { warn: (): void => {} }
}

describe('resolveRegistryDir', () => {
  it('XDG_STATE_HOME が定義されていればそちらを使う', () => {
    const dir = resolveRegistryDir({ XDG_STATE_HOME: '/custom/state' }, 'linux', '/home/user')
    expect(dir).toBe('/custom/state/git-web')
  })

  it('XDG_STATE_HOME が空文字列なら fallback を使う', () => {
    const dir = resolveRegistryDir({ XDG_STATE_HOME: '' }, 'linux', '/home/user')
    expect(dir).toBe('/home/user/.local/state/git-web')
  })

  it('Windows かつ LOCALAPPDATA があればそちらを使う', () => {
    const dir = resolveRegistryDir(
      { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
      'win32',
      'C:\\Users\\u',
    )
    expect(dir).toContain('git-web')
    expect(dir).toContain('Local')
  })

  it('XDG 未設定かつ非 Windows なら ~/.local/state/git-web', () => {
    const dir = resolveRegistryDir({}, 'darwin', '/Users/u')
    expect(dir).toBe('/Users/u/.local/state/git-web')
  })
})

describe('createNodeRegistryIO (統合)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'git-web-registry-io-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('readFile: 存在しないパスは null を返す', async () => {
    const io = createNodeRegistryIO(makeLogger())
    const result = await io.readFile(join(tmpDir, 'nope.json'))
    expect(result).toBeNull()
  })

  it('writeFileAtomic: ディレクトリを作成してから書き込みファイルが mode 0o600 になる', async () => {
    const io = createNodeRegistryIO(makeLogger())
    const filePath = join(tmpDir, 'nested', REGISTRY_FILE_NAME)

    await io.writeFileAtomic(filePath, 'hello')

    expect(await readFile(filePath, 'utf8')).toBe('hello')
    const stats = await stat(filePath)
    expect(stats.mode & 0o777).toBe(0o600)
  })

  it('writeFileAtomic: 連続書き込みで内容が置き換わる', async () => {
    const io = createNodeRegistryIO(makeLogger())
    const filePath = join(tmpDir, REGISTRY_FILE_NAME)

    await io.writeFileAtomic(filePath, 'first')
    await io.writeFileAtomic(filePath, 'second')

    expect(await readFile(filePath, 'utf8')).toBe('second')
  })

  it('acquireLock: 取得直後に同パスを再取得するとリトライ後に失敗する', async () => {
    const io = createNodeRegistryIO(makeLogger())
    const lockPath = join(tmpDir, 'test.lock')

    const release1 = await io.acquireLock(lockPath)
    try {
      await expect(io.acquireLock(lockPath)).rejects.toThrow('failed to acquire registry lock')
    } finally {
      await release1()
    }
  })

  it('acquireLock: 解放後は再取得できる', async () => {
    const io = createNodeRegistryIO(makeLogger())
    const lockPath = join(tmpDir, 'test.lock')

    const release = await io.acquireLock(lockPath)
    await release()

    const release2 = await io.acquireLock(lockPath)
    await release2()
  })

  it('acquireLock: lock ファイルに自 PID が書き込まれる', async () => {
    const io = createNodeRegistryIO(makeLogger(), { pid: 54321, pidAlive: () => true })
    const lockPath = join(tmpDir, 'test.lock')

    const release = await io.acquireLock(lockPath)
    try {
      const content = await readFile(lockPath, 'utf8')
      expect(content.trim()).toBe('54321')
    } finally {
      await release()
    }
  })

  it('acquireLock: 死んだ holder の lock を強奪する', async () => {
    const deadPid = 99999
    const warnings: string[] = []
    const logger = {
      warn: (message: string): void => {
        warnings.push(message)
      },
    }
    const io = createNodeRegistryIO(logger, {
      pid: 12345,
      pidAlive: (pid: number) => pid !== deadPid,
    })
    const lockPath = join(tmpDir, 'test.lock')

    // 死んだ PID の lock を偽装して作る
    await writeFile(lockPath, `${deadPid}\n`, { mode: 0o600 })

    const release = await io.acquireLock(lockPath)
    try {
      const content = await readFile(lockPath, 'utf8')
      expect(content.trim()).toBe('12345')
      expect(warnings.some((m) => m.includes('stale registry lock'))).toBe(true)
    } finally {
      await release()
    }
  })

  it('acquireLock: PID がパースできない lock も強奪する', async () => {
    const io = createNodeRegistryIO(makeLogger(), {
      pid: 12345,
      pidAlive: () => true,
    })
    const lockPath = join(tmpDir, 'test.lock')

    await writeFile(lockPath, 'garbage content', { mode: 0o600 })

    const release = await io.acquireLock(lockPath)
    try {
      const content = await readFile(lockPath, 'utf8')
      expect(content.trim()).toBe('12345')
    } finally {
      await release()
    }
  })

  it('acquireLock: 生きている holder の lock は強奪せずリトライで失敗する', async () => {
    const livePid = 77777
    const io = createNodeRegistryIO(makeLogger(), {
      pid: 12345,
      pidAlive: (pid: number) => pid === livePid,
    })
    const lockPath = join(tmpDir, 'test.lock')

    await writeFile(lockPath, `${livePid}\n`, { mode: 0o600 })

    await expect(io.acquireLock(lockPath)).rejects.toThrow('failed to acquire registry lock')
    // lock ファイルは強奪されていない
    const content = await readFile(lockPath, 'utf8')
    expect(content.trim()).toBe(String(livePid))
  })
})

describe('nodeHttpCheck', () => {
  it('不正な URL 文字列は false を返す', async () => {
    expect(await nodeHttpCheck('not a url', 100)).toBe(false)
  })

  it('ループバック以外のホストはリクエストせず false を返す', async () => {
    expect(await nodeHttpCheck('http://example.com:8080/', 100)).toBe(false)
    expect(await nodeHttpCheck('http://192.168.0.1:8080/', 100)).toBe(false)
  })

  it('到達不能なループバックポートは false を返す（接続拒否）', async () => {
    // ほぼ確実に使われていないポートを叩く。タイムアウト or ECONNREFUSED で false
    expect(await nodeHttpCheck('http://127.0.0.1:1/', 200)).toBe(false)
  })
})
