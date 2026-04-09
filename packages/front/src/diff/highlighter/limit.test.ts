import { describe, expect, it } from 'vitest'
import { createLimiter } from './limit.js'

/**
 * 外部から resolve できる Deferred を作る。並列順序の制御に使う。
 */
function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createLimiter', () => {
  it('maxConcurrent が 0 以下なら例外を投げる', () => {
    expect(() => createLimiter(0)).toThrow()
    expect(() => createLimiter(-1)).toThrow()
  })

  it('maxConcurrent が 1 のとき、タスクは直列に実行される', async () => {
    const limit = createLimiter(1)
    const order: number[] = []

    const d1 = createDeferred<number>()
    const d2 = createDeferred<number>()

    const p1 = limit(async () => {
      order.push(1)
      const v = await d1.promise
      order.push(10)
      return v
    })
    const p2 = limit(async () => {
      order.push(2)
      const v = await d2.promise
      order.push(20)
      return v
    })

    // 直列なので p1 が走った時点では p2 はまだ始まっていない
    await Promise.resolve()
    expect(order).toEqual([1])

    d1.resolve(1)
    await p1
    // p1 完了で next() が呼ばれ p2 が起動するが、body 実行はマイクロタスクで進む
    await Promise.resolve()
    expect(order).toEqual([1, 10, 2])

    d2.resolve(2)
    await p2
    expect(order).toEqual([1, 10, 2, 20])
  })

  it('maxConcurrent が 2 のとき同時実行数が 2 を超えない', async () => {
    const limit = createLimiter(2)
    let running = 0
    let maxObserved = 0

    // 5 つのタスクを流す。各タスクは setTimeout で短時間 hold し、
    // その間の running を maxObserved として記録する
    const tasks = Array.from({ length: 5 }, (_, i) =>
      limit(async () => {
        running += 1
        maxObserved = Math.max(maxObserved, running)
        await new Promise((r) => setTimeout(r, 5))
        running -= 1
        return i
      }),
    )

    const results = await Promise.all(tasks)

    expect(results).toEqual([0, 1, 2, 3, 4])
    expect(maxObserved).toBe(2)
    expect(running).toBe(0)
  })

  it('あるタスクが reject しても後続タスクは正常に実行される', async () => {
    const limit = createLimiter(1)
    const results: string[] = []

    const p1 = limit(() => Promise.reject(new Error('boom'))).catch((err: unknown) => {
      results.push(`rejected: ${err instanceof Error ? err.message : String(err)}`)
    })

    const p2 = limit(() => {
      results.push('p2 ran')
      return Promise.resolve('p2')
    })

    await Promise.all([p1, p2])

    // 順序はマイクロタスク実装詳細に依存するので問わない。
    // 後続タスクが走ったこと、reject が伝播したことだけを検証する。
    expect(results).toHaveLength(2)
    expect(results).toContain('rejected: boom')
    expect(results).toContain('p2 ran')
  })
})
