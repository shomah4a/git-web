/**
 * 同時実行数を制限する簡易 limiter (ADR 0017)。
 *
 * 設計方針:
 * - blob fetch と highlightFile の並列数を抑えるために使う (ADR 0014 の
 *   `/api/diff/file` 並列無制限との整合は将来課題)
 * - 依存を増やさない (p-limit 等を導入せず自前実装)
 * - キュー / 進行中カウントだけを持つ素朴な実装。fairness は FIFO
 * - いかなるタスクの reject / throw も limiter の内部状態を壊さない
 *   (必ず slot を解放する)
 */

/**
 * タスクを包んで実行する関数。並列数が上限に達していればキューに入れる。
 */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>

/**
 * 並列数制限付きの Limiter を作る。
 *
 * @param maxConcurrent 同時に実行できるタスクの最大数 (1 以上)
 */
export function createLimiter(maxConcurrent: number): Limiter {
  if (maxConcurrent < 1 || !Number.isInteger(maxConcurrent)) {
    throw new Error(`maxConcurrent must be a positive integer, got ${String(maxConcurrent)}`)
  }

  let active = 0
  const queue: Array<() => void> = []

  function next(): void {
    if (active >= maxConcurrent) {
      return
    }
    const runNext = queue.shift()
    if (runNext !== undefined) {
      runNext()
    }
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        active += 1
        fn().then(
          (value) => {
            active -= 1
            resolve(value)
            next()
          },
          (err: unknown) => {
            active -= 1
            reject(err instanceof Error ? err : new Error(String(err)))
            next()
          },
        )
      }
      if (active < maxConcurrent) {
        start()
      } else {
        queue.push(start)
      }
    })
  }

  return run
}
