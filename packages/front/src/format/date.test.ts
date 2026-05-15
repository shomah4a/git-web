import { describe, expect, it } from 'vitest'
import { createYmdFormatter } from './date.js'

describe('createYmdFormatter', () => {
  it('UTC で epoch 秒を YYYY-MM-DD に整形できる', () => {
    const fmt = createYmdFormatter('UTC')
    // 2025-04-21T00:00:00Z = 1745193600
    expect(fmt(1745193600)).toBe('2025-04-21')
  })

  it('Asia/Tokyo は UTC より日付が進む境界を扱う', () => {
    const fmt = createYmdFormatter('Asia/Tokyo')
    // 2025-04-21T15:00:00Z = JST 2025-04-22T00:00:00
    expect(fmt(1745247600)).toBe('2025-04-22')
  })

  it('同じ formatter は複数回呼んでも同じ結果を返す', () => {
    const fmt = createYmdFormatter('UTC')
    const epoch = 1745193600
    expect(fmt(epoch)).toBe(fmt(epoch))
  })

  it('epoch=0 (1970-01-01T00:00:00Z) を UTC で 1970-01-01 として返す', () => {
    const fmt = createYmdFormatter('UTC')
    expect(fmt(0)).toBe('1970-01-01')
  })
})
