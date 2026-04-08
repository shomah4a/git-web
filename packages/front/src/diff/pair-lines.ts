/**
 * Split View (左右分割) 表示用のペアリングユーティリティ。
 *
 * ADR 0015 で定義。jsdiff が生成する line 列を、
 * 左右 2 列のテーブル行に変換する純粋関数を提供する。
 *
 * 副作用なし・入力を変更しない・テスト容易。
 */

import type { DiffFileDto } from '@git-web/common'

type DiffLineDto = DiffFileDto['hunks'][number]['lines'][number]

export type SideBySideRow = {
  readonly left: DiffLineDto | null
  readonly right: DiffLineDto | null
}

/**
 * hunk 内の 1 次元 line 列を左右ペアの行配列に変換する。
 *
 * アルゴリズム:
 *  - context は左右同じ line を置く
 *  - 連続する delete を集め、直後の連続する add を集める。
 *    max(R, A) 行分のペアを生成し、足りない側は null
 *  - add だけが単独で現れる (直前に delete がない) 場合は
 *    左 null / 右 add の行にする
 */
export function pairLines(lines: ReadonlyArray<DiffLineDto>): ReadonlyArray<SideBySideRow> {
  const rows: SideBySideRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i += 1
      continue
    }
    if (line.kind === 'context') {
      rows.push({ left: line, right: line })
      i += 1
      continue
    }
    if (line.kind === 'delete') {
      // 連続する delete を収集
      const deletes: DiffLineDto[] = []
      while (i < lines.length) {
        const current = lines[i]
        if (current === undefined || current.kind !== 'delete') break
        deletes.push(current)
        i += 1
      }
      // 直後に続く連続 add を収集
      const adds: DiffLineDto[] = []
      while (i < lines.length) {
        const current = lines[i]
        if (current === undefined || current.kind !== 'add') break
        adds.push(current)
        i += 1
      }
      const pairCount = Math.max(deletes.length, adds.length)
      for (let j = 0; j < pairCount; j += 1) {
        rows.push({
          left: deletes[j] ?? null,
          right: adds[j] ?? null,
        })
      }
      continue
    }
    // 単独の add (直前 delete なし)
    rows.push({ left: null, right: line })
    i += 1
  }
  return rows
}
