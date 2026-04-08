import type { DiffFileDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import { pairLines } from './pair-lines.js'

type DiffLineDto = DiffFileDto['hunks'][number]['lines'][number]

function ctx(content: string, oldLineNo: number, newLineNo: number): DiffLineDto {
  return { kind: 'context', content, oldLineNo, newLineNo }
}

function del(content: string, oldLineNo: number): DiffLineDto {
  return { kind: 'delete', content, oldLineNo, newLineNo: null }
}

function add(content: string, newLineNo: number): DiffLineDto {
  return { kind: 'add', content, oldLineNo: null, newLineNo }
}

describe('pairLines', () => {
  it('空配列は空配列を返す', () => {
    expect(pairLines([])).toEqual([])
  })

  it('context 行は左右同一の行に展開される', () => {
    const lines = [ctx('a', 1, 1), ctx('b', 2, 2)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.left?.content).toBe('a')
    expect(rows[0]?.right?.content).toBe('a')
    expect(rows[1]?.left?.content).toBe('b')
    expect(rows[1]?.right?.content).toBe('b')
  })

  it('delete と add が同数なら 1 対 1 でペアになる', () => {
    const lines = [del('x', 1), del('y', 2), add('X', 1), add('Y', 2)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.left?.content).toBe('x')
    expect(rows[0]?.right?.content).toBe('X')
    expect(rows[1]?.left?.content).toBe('y')
    expect(rows[1]?.right?.content).toBe('Y')
  })

  it('delete が add より多いと余った delete は右が null になる', () => {
    const lines = [del('x', 1), del('y', 2), del('z', 3), add('X', 1)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(3)
    expect(rows[0]?.left?.content).toBe('x')
    expect(rows[0]?.right?.content).toBe('X')
    expect(rows[1]?.left?.content).toBe('y')
    expect(rows[1]?.right).toBeNull()
    expect(rows[2]?.left?.content).toBe('z')
    expect(rows[2]?.right).toBeNull()
  })

  it('add が delete より多いと余った add は左が null になる', () => {
    const lines = [del('x', 1), add('X', 1), add('Y', 2), add('Z', 3)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(3)
    expect(rows[0]?.left?.content).toBe('x')
    expect(rows[0]?.right?.content).toBe('X')
    expect(rows[1]?.left).toBeNull()
    expect(rows[1]?.right?.content).toBe('Y')
    expect(rows[2]?.left).toBeNull()
    expect(rows[2]?.right?.content).toBe('Z')
  })

  it('delete のみのブロックは右がすべて null になる', () => {
    const lines = [del('x', 1), del('y', 2)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.left?.content).toBe('x')
    expect(rows[0]?.right).toBeNull()
    expect(rows[1]?.left?.content).toBe('y')
    expect(rows[1]?.right).toBeNull()
  })

  it('add のみのブロックは左がすべて null になる', () => {
    const lines = [add('X', 1), add('Y', 2)]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.left).toBeNull()
    expect(rows[0]?.right?.content).toBe('X')
    expect(rows[1]?.left).toBeNull()
    expect(rows[1]?.right?.content).toBe('Y')
  })

  it('context と delete+add が混在するケースが連続して処理される', () => {
    const lines = [
      ctx('head', 1, 1),
      del('old', 2),
      add('new', 2),
      ctx('mid', 3, 3),
      del('removed', 4),
      ctx('tail', 5, 4),
    ]
    const rows = pairLines(lines)
    expect(rows).toHaveLength(5)
    expect(rows[0]?.left?.content).toBe('head')
    expect(rows[1]?.left?.content).toBe('old')
    expect(rows[1]?.right?.content).toBe('new')
    expect(rows[2]?.left?.content).toBe('mid')
    expect(rows[3]?.left?.content).toBe('removed')
    expect(rows[3]?.right).toBeNull()
    expect(rows[4]?.left?.content).toBe('tail')
  })
})
