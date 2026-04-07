import { describe, expect, it } from 'vitest'
import { jsdiffParser } from './parser.js'

/**
 * スパイク調査 (.claude/tmp/2026-04-08_jsdiff-spike.md) で採取した
 * 実際の git diff 出力をサンプルとしてパース挙動を検証する。
 */

const NORMAL_PATCH = `diff --git a/new.txt b/new.txt
index 83db48f..26ffc0d 100644
--- a/new.txt
+++ b/new.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 line3
`

const ADDED_PATCH = `diff --git a/added.ts b/added.ts
new file mode 100644
index 0000000..09b76aa
--- /dev/null
+++ b/added.ts
@@ -0,0 +1 @@
+export const x = 1
`

const DELETED_PATCH = `diff --git a/new.txt b/new.txt
deleted file mode 100644
index 26ffc0d..0000000
--- a/new.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2-modified
-line3
`

const RENAME_ONLY_PATCH = `diff --git a/orig.py b/renamed.py
similarity index 100%
rename from orig.py
rename to renamed.py
`

const BINARY_PATCH = `diff --git a/bin.dat b/bin.dat
index c866266..5663091 100644
Binary files a/bin.dat and b/bin.dat differ
`

const NO_NEWLINE_PATCH = `diff --git a/nonewline.txt b/nonewline.txt
index 7efb06f..b7a95e4 100644
--- a/nonewline.txt
+++ b/nonewline.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 no-newline
\\ No newline at end of file
`

describe('jsdiffParser', () => {
  it('空文字列は空配列を返す', () => {
    expect(jsdiffParser('')).toEqual([])
  })

  it('通常の変更をパースし、a/ b/ プレフィックスを除去する', () => {
    const result = jsdiffParser(NORMAL_PATCH)

    expect(result).toHaveLength(1)
    const file = result[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.oldPath).toBe('new.txt')
    expect(file.newPath).toBe('new.txt')
    expect(file.hunks).toHaveLength(1)
  })

  it('通常の変更の行マーカーを kind に変換し行番号を割り当てる', () => {
    const result = jsdiffParser(NORMAL_PATCH)
    const hunk = result[0]?.hunks[0]
    if (hunk === undefined) throw new Error('expected hunk')

    expect(hunk.oldStart).toBe(1)
    expect(hunk.oldLines).toBe(3)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newLines).toBe(3)
    expect(hunk.lines).toEqual([
      { kind: 'context', content: 'line1', oldLineNo: 1, newLineNo: 1 },
      { kind: 'delete', content: 'line2', oldLineNo: 2, newLineNo: null },
      { kind: 'add', content: 'line2-modified', oldLineNo: null, newLineNo: 2 },
      { kind: 'context', content: 'line3', oldLineNo: 3, newLineNo: 3 },
    ])
  })

  it('added ファイルは oldPath が null、newPath がファイル名になる', () => {
    const result = jsdiffParser(ADDED_PATCH)

    expect(result).toHaveLength(1)
    const file = result[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.oldPath).toBeNull()
    expect(file.newPath).toBe('added.ts')
    expect(file.hunks[0]?.lines).toEqual([
      { kind: 'add', content: 'export const x = 1', oldLineNo: null, newLineNo: 1 },
    ])
  })

  it('deleted ファイルは newPath が null、oldPath がファイル名になる', () => {
    const result = jsdiffParser(DELETED_PATCH)

    expect(result).toHaveLength(1)
    const file = result[0]
    if (file === undefined) throw new Error('expected first file')
    expect(file.oldPath).toBe('new.txt')
    expect(file.newPath).toBeNull()
  })

  it('rename only の patch は hunks を生成できないため空配列を返す', () => {
    const result = jsdiffParser(RENAME_ONLY_PATCH)

    expect(result).toEqual([])
  })

  it('binary patch は hunks を生成できないため空配列を返す', () => {
    const result = jsdiffParser(BINARY_PATCH)

    expect(result).toEqual([])
  })

  it('"\\ No newline at end of file" 行は lines から除外される', () => {
    const result = jsdiffParser(NO_NEWLINE_PATCH)
    const hunk = result[0]?.hunks[0]
    if (hunk === undefined) throw new Error('expected hunk')

    // マーカー行が入っていないことを確認
    for (const line of hunk.lines) {
      expect(line.content.startsWith('\\')).toBe(false)
    }
    expect(hunk.lines).toHaveLength(4)
  })
})
