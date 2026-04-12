/**
 * ファイル拡張子から Content-Type を推定する (ADR 0028)。
 */

const EXTENSION_MAP: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.bmp', 'image/bmp'],
])

const IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(EXTENSION_MAP.values())

export function inferContentType(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  const ext = path.substring(dot).toLowerCase()
  return EXTENSION_MAP.get(ext) ?? 'application/octet-stream'
}

export function isImageContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType)
}
