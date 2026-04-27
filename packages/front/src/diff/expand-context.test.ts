import type { DiffHunkDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import {
  type GapExpansion,
  type GapInfo,
  computeExpandedRange,
  computeExpandedRangeNew,
  computeGaps,
  gapNewTotal,
  gapOldTotal,
  hasRemainingLines,
  isGapFullyExpanded,
} from './expand-context.js'

function hunk(oldStart: number, oldLines: number, newStart: number, newLines: number): DiffHunkDto {
  return { oldStart, oldLines, newStart, newLines, header: '', lines: [] }
}

const noExpansion: GapExpansion = { expandedDown: 0, expandedUp: 0 }

describe('computeGaps', () => {
  it('hunkが空なら空配列を返す', () => {
    expect(computeGaps([], 100, 100)).toEqual([])
  })

  it('hunkが1つの場合は先頭と末尾の2つのギャップを返す', () => {
    // old: 1-100行、hunk: old 5-7 (3行)
    const gaps = computeGaps([hunk(5, 3, 5, 3)], 100, 100)
    expect(gaps).toHaveLength(2)
    // 先頭ギャップ: old 1-4, new 1-4
    expect(gaps[0]).toEqual({ oldFrom: 1, oldTo: 4, newFrom: 1, newTo: 4 })
    // 末尾ギャップ: old 8-100, new 8-100
    expect(gaps[1]).toEqual({ oldFrom: 8, oldTo: 100, newFrom: 8, newTo: 100 })
  })

  it('先頭ギャップが存在しない場合はnullを返す', () => {
    const gaps = computeGaps([hunk(1, 3, 1, 3)], 100, 100)
    expect(gaps[0]).toBeNull()
  })

  it('末尾ギャップが存在しない場合はnullを返す', () => {
    const gaps = computeGaps([hunk(98, 3, 98, 3)], 100, 100)
    expect(gaps[1]).toBeNull()
  })

  it('hunkが2つの場合は3つのギャップを返す', () => {
    const gaps = computeGaps([hunk(5, 3, 5, 3), hunk(20, 2, 20, 2)], 50, 50)
    expect(gaps).toHaveLength(3)
    // 先頭: 1-4
    expect(gaps[0]).toEqual({ oldFrom: 1, oldTo: 4, newFrom: 1, newTo: 4 })
    // hunk間: 8-19
    expect(gaps[1]).toEqual({ oldFrom: 8, oldTo: 19, newFrom: 8, newTo: 19 })
    // 末尾: 22-50
    expect(gaps[2]).toEqual({ oldFrom: 22, oldTo: 50, newFrom: 22, newTo: 50 })
  })

  it('hunk間にギャップがない場合はnullを返す', () => {
    // hunk1: old 5-7, hunk2: old 8-10 → ギャップなし
    const gaps = computeGaps([hunk(5, 3, 5, 3), hunk(8, 3, 8, 3)], 50, 50)
    expect(gaps[1]).toBeNull()
  })

  it('addedファイル(oldStart=0, oldLines=0)では末尾ギャップがnullになる', () => {
    // added: old側なし、new側は全行がhunk
    const gaps = computeGaps([hunk(0, 0, 1, 10)], 0, 10)
    expect(gaps).toHaveLength(2)
    // 先頭: oldFrom=1, oldTo=-1 → 空、newFrom=1, newTo=0 → 空 → null
    expect(gaps[0]).toBeNull()
    // 末尾: oldFrom=0, oldTo=0 → 0 < 1 で空、newFrom=11, newTo=10 → 空 → null
    expect(gaps[1]).toBeNull()
  })

  it('old側とnew側で行数が異なるhunkのギャップを正しく計算する', () => {
    // hunk1: old 5行消費、new 7行消費 → ギャップの開始行がずれる
    const gaps = computeGaps([hunk(5, 5, 5, 7), hunk(20, 2, 22, 2)], 50, 52)
    expect(gaps).toHaveLength(3)
    // hunk間: old 10-19, new 12-21
    expect(gaps[1]).toEqual({ oldFrom: 10, oldTo: 19, newFrom: 12, newTo: 21 })
  })
})

describe('gapOldTotal / gapNewTotal', () => {
  it('行範囲から行数を計算する', () => {
    const gap: GapInfo = { oldFrom: 5, oldTo: 14, newFrom: 7, newTo: 18 }
    expect(gapOldTotal(gap)).toBe(10)
    expect(gapNewTotal(gap)).toBe(12)
  })

  it('from > to の場合は0を返す', () => {
    const gap: GapInfo = { oldFrom: 10, oldTo: 5, newFrom: 1, newTo: 3 }
    expect(gapOldTotal(gap)).toBe(0)
  })
})

describe('isGapFullyExpanded', () => {
  it('展開なしならfalse', () => {
    const gap: GapInfo = { oldFrom: 1, oldTo: 10, newFrom: 1, newTo: 10 }
    expect(isGapFullyExpanded(gap, noExpansion)).toBe(false)
  })

  it('down + up がギャップ行数以上ならtrue', () => {
    const gap: GapInfo = { oldFrom: 1, oldTo: 10, newFrom: 1, newTo: 10 }
    expect(isGapFullyExpanded(gap, { expandedDown: 5, expandedUp: 5 })).toBe(true)
  })

  it('down + up がギャップ行数を超過してもtrue', () => {
    const gap: GapInfo = { oldFrom: 1, oldTo: 10, newFrom: 1, newTo: 10 }
    expect(isGapFullyExpanded(gap, { expandedDown: 10, expandedUp: 10 })).toBe(true)
  })

  it('old/newで行数が異なる場合はmax側で判定する', () => {
    const gap: GapInfo = { oldFrom: 1, oldTo: 5, newFrom: 1, newTo: 10 }
    // old=5, new=10 → max=10
    expect(isGapFullyExpanded(gap, { expandedDown: 5, expandedUp: 4 })).toBe(false)
    expect(isGapFullyExpanded(gap, { expandedDown: 5, expandedUp: 5 })).toBe(true)
  })
})

describe('computeExpandedRange', () => {
  const gap: GapInfo = { oldFrom: 10, oldTo: 29, newFrom: 10, newTo: 29 }

  it('展開なしならdown/upともにnull', () => {
    const range = computeExpandedRange(gap, noExpansion)
    expect(range.down).toBeNull()
    expect(range.up).toBeNull()
  })

  it('down方向に10行展開するとold 10-19を返す', () => {
    const range = computeExpandedRange(gap, { expandedDown: 10, expandedUp: 0 })
    expect(range.down).toEqual({ from: 10, to: 19 })
    expect(range.up).toBeNull()
  })

  it('up方向に10行展開するとold 20-29を返す', () => {
    const range = computeExpandedRange(gap, { expandedDown: 0, expandedUp: 10 })
    expect(range.down).toBeNull()
    expect(range.up).toEqual({ from: 20, to: 29 })
  })

  it('down+upが重なった場合はdown側の範囲とup側の残りに分割する', () => {
    // ギャップ20行に対して down=12, up=12 → down が 10-21, up が 22-29
    const range = computeExpandedRange(gap, { expandedDown: 12, expandedUp: 12 })
    expect(range.down).toEqual({ from: 10, to: 21 })
    expect(range.up).toEqual({ from: 22, to: 29 })
  })

  it('down+upがちょうどギャップ行数なら各方向の範囲で分割する', () => {
    const range = computeExpandedRange(gap, { expandedDown: 10, expandedUp: 10 })
    expect(range.down).toEqual({ from: 10, to: 19 })
    expect(range.up).toEqual({ from: 20, to: 29 })
  })

  it('upのみで全展開した場合は全行がupに入る', () => {
    const range = computeExpandedRange(gap, { expandedDown: 0, expandedUp: 20 })
    expect(range.down).toBeNull()
    expect(range.up).toEqual({ from: 10, to: 29 })
  })

  it('downのみで全展開した場合は全行がdownに入る', () => {
    const range = computeExpandedRange(gap, { expandedDown: 20, expandedUp: 0 })
    expect(range.down).toEqual({ from: 10, to: 29 })
    expect(range.up).toBeNull()
  })
})

describe('computeExpandedRangeNew', () => {
  it('new側の行範囲で算出する', () => {
    const gap: GapInfo = { oldFrom: 10, oldTo: 19, newFrom: 12, newTo: 23 }
    const range = computeExpandedRangeNew(gap, { expandedDown: 5, expandedUp: 0 })
    expect(range.down).toEqual({ from: 12, to: 16 })
  })
})

describe('hasRemainingLines', () => {
  const gap: GapInfo = { oldFrom: 1, oldTo: 20, newFrom: 1, newTo: 20 }

  it('展開なしならdown/upともにtrue', () => {
    expect(hasRemainingLines(gap, noExpansion, 'down')).toBe(true)
    expect(hasRemainingLines(gap, noExpansion, 'up')).toBe(true)
  })

  it('完全展開済みならfalse', () => {
    const full: GapExpansion = { expandedDown: 10, expandedUp: 10 }
    expect(hasRemainingLines(gap, full, 'down')).toBe(false)
    expect(hasRemainingLines(gap, full, 'up')).toBe(false)
  })

  it('down側がtotal以上ならdown方向はfalse', () => {
    const exp: GapExpansion = { expandedDown: 20, expandedUp: 0 }
    expect(hasRemainingLines(gap, exp, 'down')).toBe(false)
  })
})
