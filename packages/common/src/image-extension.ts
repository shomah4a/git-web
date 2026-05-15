/**
 * ファイル拡張子から画像かどうかを判定し、対応する Content-Type を返す共通定義。
 *
 * 設計方針 (ADR 0052 / ADR 0053):
 * - フロント (BlobContent の image kind 判定) と API (/api/blob/raw の Content-Type)
 *   の両方で参照される single source of truth
 * - 副作用ゼロ・外部ライブラリ依存ゼロの純粋関数群
 * - 拡張子の追加はこのファイルのみを更新すれば双方に反映される
 *
 * 対応拡張子の選定基準: 主要モダンブラウザ (Chrome / Firefox / Safari / Edge)
 * すべてが `<img>` タグで表示可能な形式に限定する。Safari 専用形式
 * (JPEG XL / HEIC / TIFF / JPEG 2000) は ADR 0052 §4 で見送り済。
 */

export const IMAGE_EXTENSION_TO_MIME: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.apng', 'image/apng'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.jfif', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.bmp', 'image/bmp'],
])

function extractExtension(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return null
  return path.substring(dot).toLowerCase()
}

/**
 * パスの拡張子が画像形式かどうかを判定する。
 */
export function isImageExtension(path: string): boolean {
  const ext = extractExtension(path)
  if (ext === null) return false
  return IMAGE_EXTENSION_TO_MIME.has(ext)
}

/**
 * パスの拡張子から画像 Content-Type を推定する。画像でなければ null。
 */
export function inferImageContentType(path: string): string | null {
  const ext = extractExtension(path)
  if (ext === null) return null
  return IMAGE_EXTENSION_TO_MIME.get(ext) ?? null
}
