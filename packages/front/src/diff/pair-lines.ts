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
 * アルゴリズム (ADR 0015):
 *  - context は左右同じ line を置く
 *  - 連続する delete を集め、直後に連続する add が続くならそれも集める。
 *    max(deletes.length, adds.length) 行分のペアを生成し、足りない側は null で埋める
 *  - 直前に delete がない単独の add は { left: null, right: add } として出力する
 *
 * これにより modify ブロック (delete と add が隣接する変更) は同じ行に
 * 左=旧 / 右=新 として並び、純削除 / 純追加は対面が null のまま残る。
 * 空の cell は描画側で min-height により 1 行分の高さを確保する。
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
      const deletes: DiffLineDto[] = []
      while (i < lines.length) {
        const current = lines[i]
        if (current === undefined || current.kind !== 'delete') break
        deletes.push(current)
        i += 1
      }
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
    // 直前 delete のない単独 add
    rows.push({ left: null, right: line })
    i += 1
  }
  return rows
}
