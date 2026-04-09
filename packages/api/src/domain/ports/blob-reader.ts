/**
 * blob (ファイル内容) 読み取り port。
 *
 * 設計方針 (ADR 0011 / ADR 0016):
 * - /api/blob エンドポイントが依存する外部副作用 (git / ファイルシステム) を
 *   1 つの interface に集約する
 * - rev が null の場合は worktree のファイルを返す
 * - rev が非 null の場合は git からそのリビジョンの blob を返す
 * - 実装は以下の 2 種とそれらを rev の有無でディスパッチする composite:
 *   - adapter/fs/worktree-blob-reader.ts (rev === null)
 *   - adapter/git/cat-file-blob-reader.ts (rev !== null)
 *   - adapter/blob-reader-composite.ts
 * - ファイルが存在しない場合は null を返す (controller 側で 404 にマップ)
 * - language は本 port では埋めない。service 層で inferLanguage を使って付与する
 */

import type { Blob } from '../blob.js'
import type { Revision } from '../revision.js'

export interface BlobReader {
  read(path: string, rev: Revision | null): Promise<Blob | null>
}
