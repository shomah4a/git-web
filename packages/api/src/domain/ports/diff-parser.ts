/**
 * unified diff テキストを構造化するための port。
 *
 * 設計方針 (ADR 0011 / ADR 0012):
 * - 実装は adapter 層に置く (adapter/jsdiff/parser.ts)
 * - ドメインは parse ライブラリ (jsdiff) の存在を知らない
 * - 戻り値はドメインモデル (DiffHunk[]) であり、adapter 層が
 *   外部ライブラリの型をドメイン型に変換する責務を持つ
 */

import type { DiffHunk } from '../diff.js'

/**
 * unified diff テキストの解析結果。
 *
 * addedFromDevNull / deletedToDevNull は jsdiff の `/dev/null` 判定から
 * 導出される。binary や rename は unified diff 本体からは判定できないため
 * 別経路で判定する (ファイルリストの --raw / --numstat 経路)。
 */
export type ParsedDiffFile = {
  readonly oldPath: string | null
  readonly newPath: string | null
  readonly hunks: ReadonlyArray<DiffHunk>
}

/**
 * unified diff テキストをドメイン表現にパースする。
 *
 * - 空文字列 / 空の patch は長さ 0 の配列を返す
 * - 1 つのテキストに複数ファイルの patch が含まれていれば複数エントリを返す
 * - ファイル名から git の "a/" / "b/" プレフィックスは除去済みであること
 */
export type DiffParser = (patchText: string) => ReadonlyArray<ParsedDiffFile>
