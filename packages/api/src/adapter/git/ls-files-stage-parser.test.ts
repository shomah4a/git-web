import { describe, expect, it } from 'vitest'
import { parseLsFilesStageZ } from './ls-files-stage-parser.js'

describe('parseLsFilesStageZ', () => {
  it('空文字列は空Mapを返す', () => {
    expect(parseLsFilesStageZ('')).toEqual(new Map())
  })

  it('単一エントリからmodeを抽出できる', () => {
    const input = '100644 abc1234 0\tREADME.md\0'
    const result = parseLsFilesStageZ(input)
    expect(result).toEqual(new Map([['README.md', '100644']]))
  })

  it('複数エントリからmodeを抽出できる', () => {
    const input = '100644 abc1234 0\tREADME.md\x00100755 def5678 0\tbin/run.sh\x00'
    const result = parseLsFilesStageZ(input)
    expect(result).toEqual(
      new Map([
        ['README.md', '100644'],
        ['bin/run.sh', '100755'],
      ]),
    )
  })

  it('シンボリックリンクのmodeを抽出できる', () => {
    const input = '120000 abc1234 0\tlink.txt\0'
    const result = parseLsFilesStageZ(input)
    expect(result).toEqual(new Map([['link.txt', '120000']]))
  })

  it('末尾NULなしでもパースできる', () => {
    const input = '100644 abc1234 0\tREADME.md'
    const result = parseLsFilesStageZ(input)
    expect(result).toEqual(new Map([['README.md', '100644']]))
  })

  it('タブを含まない不正エントリはスキップする', () => {
    const input = 'broken-entry\x00100644 abc1234 0\tvalid.ts\x00'
    const result = parseLsFilesStageZ(input)
    expect(result).toEqual(new Map([['valid.ts', '100644']]))
  })
})
