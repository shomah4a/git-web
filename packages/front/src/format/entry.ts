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

export function formatMode(entry: Pick<EntryBaseDto, 'mode'>): string {
  const mode = entry.mode
  if (mode === null) return '-'
  return mode
}
