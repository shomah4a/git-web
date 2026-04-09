/**
 * realpath ベースの repo root 境界判定 (純粋関数)。
 *
 * 設計方針 (ADR 0009 §2 / ADR 0016):
 * - シンボリックリンクを解決済みの絶対パス (realpath) 2 つを受け取り、
 *   target が root 以下 (root 自身を含む) に属するかを判定する
 * - `startsWith(root + sep)` だけだと root 自身との完全一致が false になる。
 *   本関数は完全一致も許容する
 * - さらに `rootReal_sibling` のように root 文字列に末尾 sep なしで続くパス
 *   (兄弟ディレクトリ) を false と判定するために、比較時に明示的に
 *   `root + sep` を付与する
 * - 呼び出し側は両パスを `fs.realpath` で解決してから渡すこと。本関数は
 *   文字列比較のみで副作用を持たない
 */

import { sep } from 'node:path'

/**
 * target が root 配下 (root 自身を含む) にあるかを判定する。
 *
 * 前提:
 * - `rootReal` / `targetReal` はどちらも `fs.realpath` 済みの絶対パス
 * - 末尾 sep は持たない (Node の `fs.realpath` 仕様どおり)
 *
 * 完全一致 (`targetReal === rootReal`) と、root 直下・サブディレクトリ
 * (`targetReal` が `rootReal + sep` で始まる) の両方を内包と判定する。
 * `rootReal_sibling` のような兄弟パスは false を返す。
 */
export function isInsideRepo(rootReal: string, targetReal: string): boolean {
  if (targetReal === rootReal) {
    return true
  }
  return targetReal.startsWith(rootReal + sep)
}
