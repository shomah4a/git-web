/**
 * ファイル拡張子から Content-Type を推定する (ADR 0028 / ADR 0052 / ADR 0053)。
 *
 * 画像拡張子マップは `@git-web/common` に集約されているため、ここでは
 * 画像でない場合のフォールバック (`application/octet-stream`) のみを補う。
 */

import { inferImageContentType } from '@git-web/common'

export function inferContentType(path: string): string {
  return inferImageContentType(path) ?? 'application/octet-stream'
}
