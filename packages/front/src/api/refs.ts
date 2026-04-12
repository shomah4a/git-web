import type { RefListDto } from '@git-web/common'

/**
 * refs 一覧 API 呼び出しのクライアント層 (ADR 0018 / ADR 0019 / ADR 0032)。
 *
 * 設計方針:
 * - レスポンスは unknown で受けて型ガードで narrow する (`as` 禁止、ADR 0010)
 * - クエリは URLSearchParams 経由で組み立て、`q` を安全にエンコードする
 * - ADR 0032: limit は撤廃。全件返却
 * - 4xx/5xx は throw する。呼び出し側 (RevisionCombobox) で catch し、候補欄の
 *   フォールバック表示に倒す
 */

/**
 * GET /api/refs?q=<q> を呼んでブランチ/タグ一覧を取得する。
 *
 * @param q 部分一致フィルタ文字列 (空文字列可)
 */
export async function fetchRefs(q: string): Promise<RefListDto> {
  const params = new URLSearchParams()
  params.set('q', q)
  const response = await fetch(`/api/refs?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`/api/refs returned HTTP ${response.status.toString()}`)
  }
  const data: unknown = await response.json()
  if (!isRefListDto(data)) {
    throw new Error('/api/refs returned unexpected body shape')
  }
  return data
}

// ---------- 型ガード ----------

function isStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false
  for (const item of value) {
    if (typeof item !== 'string') return false
  }
  return true
}

function isRefListDto(value: unknown): value is RefListDto {
  if (typeof value !== 'object' || value === null) return false
  if (!('defaultBranch' in value)) return false
  if (value.defaultBranch !== null && typeof value.defaultBranch !== 'string') return false
  if (!('branches' in value) || !isStringArray(value.branches)) return false
  if (!('tags' in value) || !isStringArray(value.tags)) return false
  return true
}
