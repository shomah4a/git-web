import type { DiffHunkDto, DiffLineDto } from '@git-web/common'
import { describe, expect, it } from 'vitest'
import { translateNewLine, translateRange } from './translate-line.js'

function ctx(oldNo: number, newNo: number): DiffLineDto {
  return { kind: 'context', content: 'x', oldLineNo: oldNo, newLineNo: newNo }
}
function add(newNo: number): DiffLineDto {
  return { kind: 'add', content: 'x', oldLineNo: null, newLineNo: newNo }
}
function del(oldNo: number): DiffLineDto {
  return { kind: 'delete', content: 'x', oldLineNo: oldNo, newLineNo: null }
}
function hunk(
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
  lines: DiffLineDto[],
): DiffHunkDto {
  return { oldStart, oldLines, newStart, newLines, header: '', lines }
}

describe('translateNewLine', () => {
  it('hunkが無ければ行番号はそのまま', () => {
    expect(translateNewLine(7, [])).toEqual({ kind: 'mapped', line: 7 })
  })

  it('hunkより前の行は変化しない', () => {
    // 行5を追加する hunk (oldStart=5)。行3はhunkより前なので不変。
    const h = hunk(5, 1, 5, 2, [add(5), ctx(5, 6)])
    expect(translateNewLine(3, [h])).toEqual({ kind: 'mapped', line: 3 })
  })

  it('追加で押し下げられた後続行はオフセットが加算される', () => {
    // old 1..3 → new に1行挿入。old3 は new4 へ。
    const h = hunk(1, 3, 1, 4, [ctx(1, 1), add(2), ctx(2, 3), ctx(3, 4)])
    expect(translateNewLine(3, [h])).toEqual({ kind: 'mapped', line: 4 })
  })

  it('hunk内のcontext行は対応するnew行へ翻訳される', () => {
    const h = hunk(1, 3, 1, 4, [ctx(1, 1), add(2), ctx(2, 3), ctx(3, 4)])
    expect(translateNewLine(2, [h])).toEqual({ kind: 'mapped', line: 3 })
  })

  it('削除された行はoutdatedになる', () => {
    // old 1..3 で old2 を削除。
    const h = hunk(1, 3, 1, 2, [ctx(1, 1), del(2), ctx(3, 2)])
    expect(translateNewLine(2, [h])).toEqual({ kind: 'outdated' })
  })

  it('複数hunkを跨いだ後続行は全hunkのdeltaが累積される', () => {
    // hunk1: old1..1 を new1..2 (1行追加, delta +1)
    // hunk2: old5..5 を new6..7 (1行追加)
    // old10 は両hunkより後 → +2
    const h1 = hunk(1, 1, 1, 2, [ctx(1, 1), add(2)])
    const h2 = hunk(5, 1, 6, 2, [ctx(5, 6), add(7)])
    expect(translateNewLine(10, [h1, h2])).toEqual({ kind: 'mapped', line: 12 })
  })
})

describe('translateRange', () => {
  it('mapped な範囲は start/end を翻訳する', () => {
    const h = hunk(1, 3, 1, 4, [ctx(1, 1), add(2), ctx(2, 3), ctx(3, 4)])
    expect(translateRange(2, 3, [h])).toEqual({ kind: 'mapped', start: 3, end: 4 })
  })

  it('start が削除されていれば範囲全体が outdated', () => {
    const h = hunk(1, 3, 1, 2, [ctx(1, 1), del(2), ctx(3, 2)])
    expect(translateRange(2, 2, [h])).toEqual({ kind: 'outdated' })
  })
})
