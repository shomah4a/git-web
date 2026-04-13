/**
 * EntryBaseDto の mode / size フォーマット関数 (ADR 0026)。
 */

import type { EntryBaseDto } from '@git-web/common'

export function formatSize(entry: Pick<EntryBaseDto, 'size'>): string {
  const size = entry.size
  if (size === null) return '-'
  if (size < 1024) return `${size.toString()} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** POSIX ファイルタイプビットマスク (上位 4 ビット相当) */
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000
const S_IFGITLINK = 0o160000

function fileTypeChar(bits: number): string {
  const ft = bits & S_IFMT
  if (ft === S_IFDIR) return 'd'
  if (ft === S_IFLNK) return 'l'
  if (ft === S_IFGITLINK) return 'm'
  return '-'
}

function permTriple(bits: number, shift: number): string {
  const r = bits & (0o4 << shift) ? 'r' : '-'
  const w = bits & (0o2 << shift) ? 'w' : '-'
  const x = bits & (0o1 << shift) ? 'x' : '-'
  return `${r}${w}${x}`
}

export function formatMode(entry: Pick<EntryBaseDto, 'mode'>): string {
  const mode = entry.mode
  if (mode === null) return '-'
  const bits = parseInt(mode, 8)
  if (Number.isNaN(bits)) return mode
  return `${fileTypeChar(bits)}${permTriple(bits, 6)}${permTriple(bits, 3)}${permTriple(bits, 0)}`
}
