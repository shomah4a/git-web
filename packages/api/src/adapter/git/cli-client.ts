/**
 * git CLI を子プロセスとして起動する GitClient / GitDiffClient 実装。
 *
 * 設計方針:
 * - ADR 0007 / 0009 に従い、シェル経由実行は行わない (`execFile` を使う)。
 *   引数は必ず配列で渡す
 * - 外部ライブラリ依存はここに閉じ込める (adapter 層の責務)
 * - diff 系は 2 コマンド方式 (--raw -z と --numstat -z を別々に実行)
 *   で path キーマージする (ADR 0012 / M7 対応)
 * - ADR 0018 に従い、revision 引数がフラグとして解釈されないよう
 *   必ず `--end-of-options` 以降に置く (git 2.24+ 前提)。
 *   これは parseRevision の入力検査に対する二層防御
 */

import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { DiffFileSummary } from '../../domain/diff.js'
import type { DiffRange } from '../../domain/diff-range.js'
import type { GitClient } from '../../domain/ports/git-client.js'
import type { HeadInfo } from '../../domain/repo.js'
import type { GitDiffClient } from '../../domain/ports/git-diff-client.js'
import type { GitShaResolver } from '../../domain/ports/git-sha-resolver.js'
import type { GitLogClient } from '../../domain/ports/git-log-client.js'
import type { LogQuery, LogResult } from '../../domain/ports/git-log-client.js'
import type { GitRefsClient } from '../../domain/ports/git-refs-client.js'
import type { GitTreeClient } from '../../domain/ports/git-tree-client.js'
import type {
  GitTreeCommitsClient,
  LastCommitInfo,
} from '../../domain/ports/git-tree-commits-client.js'
import type { Revision } from '../../domain/revision.js'
import type { TreeEntry } from '../../domain/tree.js'
import { parseNumstatZ, parseRawZ } from './diff-summary-parser.js'
import { extractOneLevel } from './ls-files-parser.js'
import { LOG_FORMAT, parseLogOutput } from './log-parser.js'
import { parseLsTreeZ } from './ls-tree-parser.js'
import { parseStatusZ } from './status-parser.js'
import { parseTreeCommitsOutput } from './tree-commits-parser.js'

const execFileAsync = promisify(execFile)

/**
 * git diff 系コマンドの stdout バッファ上限。
 * 大規模リポジトリでも一般的な diff サイズを許容するため 50 MB に設定する。
 */
const DIFF_MAX_BUFFER = 50 * 1024 * 1024

/**
 * tree-commits 用の git log --format 文字列 (ADR 0054)。
 *
 * フィールド順: hash / date(epoch秒) / subject
 * 末尾の %x01 は subject と続く name-only ブロックの境界マーカ。
 */
const TREE_COMMITS_FORMAT = '%x00%H%x01%ct%x01%s%x01'

/**
 * 子プロセスとして git CLI を起動する GitClient / GitDiffClient 実装。
 */
export class CliGitClient
  implements
    GitClient,
    GitDiffClient,
    GitLogClient,
    GitRefsClient,
    GitShaResolver,
    GitTreeClient,
    GitTreeCommitsClient
{
  readonly #cwd: string

  constructor(cwd: string) {
    this.#cwd = cwd
  }

  /**
   * リビジョンを 40 桁 commit SHA へ解決する (ADR 0057)。
   *
   * - `<rev>^{commit}` で annotated tag 等を commit に peel する
   * - `--verify` で曖昧/不正な指定を非ゼロ終了させる
   * - `--end-of-options` で rev がフラグ解釈されないよう二層防御 (ADR 0018)
   */
  async resolveCommitSha(rev: Revision): Promise<string> {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--verify', '--end-of-options', `${rev.raw}^{commit}`],
      { cwd: this.#cwd },
    )
    return stdout.trim()
  }

  /**
   * `git rev-list <from>..<to>` を実行して 40 桁 SHA 列を返す (ADR 0060 E2)。
   *
   * - from.raw / to.raw は parseRevision 済みでシェルメタを含まないため、
   *   `<from>..<to>` を 1 つの operand として安全に渡せる
   * - `--end-of-options` で operand がフラグ解釈されないよう二層防御 (ADR 0018)
   */
  async revListRange(from: Revision, to: Revision): Promise<ReadonlyArray<string>> {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-list', '--end-of-options', `${from.raw}..${to.raw}`],
      { cwd: this.#cwd, maxBuffer: DIFF_MAX_BUFFER },
    )
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  }

  async head(): Promise<HeadInfo> {
    const { stdout: hashOut } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: this.#cwd,
    })
    const commitHash = hashOut.trim()

    let branch: string | null = null
    try {
      const { stdout: refOut } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], {
        cwd: this.#cwd,
      })
      branch = refOut.trim()
    } catch {
      // detached HEAD の場合 symbolic-ref は非ゼロで終了する
    }

    return { commitHash, branch }
  }

  async repoRoot(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: this.#cwd,
    })
    return stdout.trim()
  }

  /**
   * メイン (ルート) worktree のトップレベル絶対パスを返す (ADR 0058)。
   *
   * リンク worktree から起動しても、レビューはリポジトリ単位の情報として
   * メイン worktree 側に集約するために使う。`--git-common-dir` は共有 git dir
   * (通常 `<mainRoot>/.git`) を返すため、その親をメイン worktree ルートとする。
   * - メイン worktree: `--git-common-dir` = `.git` (相対) → cwd 基準で解決
   * - リンク worktree: `--git-common-dir` = `<mainRoot>/.git` (絶対)
   * (注: `--separate-git-dir` 等で共有 dir が `<root>/.git` でない構成は非対象)
   */
  async mainWorktreeRoot(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], {
      cwd: this.#cwd,
    })
    const commonDir = resolve(this.#cwd, stdout.trim())
    return dirname(commonDir)
  }

  async diffSummary(range: DiffRange): Promise<ReadonlyArray<DiffFileSummary>> {
    const rangeArgs = toGuardedRangeArgs(range)
    const [rawResult, numResult] = await Promise.all([
      execFileAsync('git', ['diff', '--raw', '-z', '-M', ...rangeArgs], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
      execFileAsync('git', ['diff', '--numstat', '-z', '-M', ...rangeArgs], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
    ])
    const rawEntries = parseRawZ(rawResult.stdout)
    const numEntries = parseNumstatZ(numResult.stdout)
    const numByPath = new Map(numEntries.map((entry) => [entry.path, entry]))

    const result: DiffFileSummary[] = []
    for (const raw of rawEntries) {
      const num = numByPath.get(raw.path)
      const additions = num?.additions ?? 0
      const deletions = num?.deletions ?? 0
      const binary = num !== undefined && num.additions === null && num.deletions === null
      result.push({
        path: raw.path,
        oldPath: raw.oldPath,
        status: raw.status,
        additions,
        deletions,
        binary,
      })
    }
    return result
  }

  async listBranches(): Promise<ReadonlyArray<string>> {
    return this.#listRefsBySpec('refs/heads')
  }

  async listTags(): Promise<ReadonlyArray<string>> {
    return this.#listRefsBySpec('refs/tags')
  }

  async #listRefsBySpec(refSpec: string): Promise<ReadonlyArray<string>> {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', refSpec],
      {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      },
    )
    if (stdout.length === 0) {
      return []
    }
    // ref 名に改行は入らない (git check-ref-format の制約)
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  async diffFile(range: DiffRange, path: string): Promise<string> {
    const rangeArgs = toGuardedRangeArgs(range)
    const { stdout } = await execFileAsync('git', ['diff', '-M', ...rangeArgs, '--', path], {
      cwd: this.#cwd,
      maxBuffer: DIFF_MAX_BUFFER,
    })
    return stdout
  }

  async listTree(rev: Revision, path: string): Promise<ReadonlyArray<TreeEntry>> {
    const args = path === '' ? [rev.raw] : [`${rev.raw}:${path}`]
    const { stdout } = await execFileAsync(
      'git',
      ['ls-tree', '-l', '-z', '--end-of-options', ...args],
      {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      },
    )
    return parseLsTreeZ(stdout, path)
  }

  async log(query: LogQuery): Promise<LogResult> {
    const fetchCount = query.limit + 1
    const args = ['log', `--format=${LOG_FORMAT}`, '--numstat', `-n`, fetchCount.toString()]

    // after 指定時は after の親を起点にする。
    // after は rev の歴史上にある SHA なので、after~ から辿るコミットは
    // rev の歴史に包含される。rev を union で渡さないことで重複を防ぐ。
    if (query.after !== null) {
      args.push('--end-of-options', `${query.after}~1`)
    } else {
      args.push('--end-of-options', query.rev.raw)
    }

    if (query.path !== null) {
      args.push('--', query.path)
    }

    const { stdout } = await execFileAsync('git', args, {
      cwd: this.#cwd,
      maxBuffer: DIFF_MAX_BUFFER,
    })

    const allCommits = parseLogOutput(stdout)
    const hasMore = allCommits.length > query.limit
    const commits = hasMore ? allCommits.slice(0, query.limit) : allCommits

    return { commits, hasMore }
  }

  /**
   * 指定 dir 直下の各 name について最終コミット情報を返す (ADR 0054)。
   *
   * - `--no-merges`: マージコミットを除外し、ファイル内容を実際に変更した
   *   コミットを最終コミットとして採用する (subject が "Merge branch 'X'" の
   *   情報量薄いコミットを避ける、ADR 0054 §2)
   * - `-c core.quotePath=true`: ユーザー gitconfig に依存せずパスの非 ASCII を
   *   C-style クォートさせる
   * - `--no-renames`: rename 追跡は本機能スコープ外
   * - 早期終了: 全 targetNames が確定したら git の出力読み取りは続行するが、
   *   ループ内で確定済みエントリは無視する (Promise 単位で一気に取得済みのため
   *   実装上は走査打ち切りのみ)
   */
  async lastCommitsByName(
    rev: Revision,
    dir: string,
    targetNames: ReadonlySet<string>,
    maxCount: number,
  ): Promise<ReadonlyMap<string, LastCommitInfo>> {
    if (targetNames.size === 0) {
      return new Map()
    }

    const dirPrefix = dir === '' ? '' : ensureTrailingSlash(dir)
    const args: string[] = [
      '-c',
      'core.quotePath=true',
      'log',
      '--no-merges',
      `--format=${TREE_COMMITS_FORMAT}`,
      '--name-only',
      '--no-renames',
      `--max-count=${maxCount.toString()}`,
      '--end-of-options',
      rev.raw,
    ]
    if (dirPrefix !== '') {
      args.push('--', dirPrefix)
    }

    const { stdout } = await execFileAsync('git', args, {
      cwd: this.#cwd,
      maxBuffer: DIFF_MAX_BUFFER,
    })

    const records = parseTreeCommitsOutput(stdout)
    const result = new Map<string, LastCommitInfo>()

    for (const record of records) {
      if (result.size === targetNames.size) {
        break
      }
      for (const path of record.paths) {
        const name = extractImmediateChildName(path, dirPrefix)
        if (name === null) continue
        if (!targetNames.has(name)) continue
        if (result.has(name)) continue
        result.set(name, {
          hash: record.hash,
          date: record.date,
          subject: record.subject,
        })
        if (result.size === targetNames.size) {
          break
        }
      }
    }

    return result
  }

  /**
   * worktree の指定パス配下 1 階層分のエントリを返す。
   *
   * git ls-files で tracked + untracked (.gitignore 除外) を列挙し、
   * git status で各ファイルの状態を付与する。
   */
  async listWorktreeTree(path: string): Promise<ReadonlyArray<TreeEntry>> {
    const [lsResult, statusResult] = await Promise.all([
      execFileAsync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
      execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
        cwd: this.#cwd,
        maxBuffer: DIFF_MAX_BUFFER,
      }),
    ])
    const statusMap = parseStatusZ(statusResult.stdout)
    return extractOneLevel(lsResult.stdout, path, statusMap)
  }
}

/**
 * DiffRange を git diff コマンドの範囲引数に変換する。
 *
 * ADR 0018 の二層防御方針に従い、revision 引数の前に必ず `--end-of-options`
 * を置く。これにより parseRevision のバリデーションが崩れても git 側で
 * フラグとして解釈されない。呼び出し側で `--end-of-options` を手書きしない
 * ことで、将来の diff 系コマンド追加時の付け忘れを構造的に防ぐ。
 *
 * - working-vs-head → ['--end-of-options', 'HEAD']      (git diff HEAD)
 * - working-vs-rev  → ['--end-of-options', from]        (git diff <from>)
 * - rev-vs-rev      → ['--end-of-options', from, to]    (git diff <from> <to>)
 */
function toGuardedRangeArgs(range: DiffRange): ReadonlyArray<string> {
  const revs =
    range.kind === 'working-vs-head'
      ? ['HEAD']
      : range.kind === 'working-vs-rev'
        ? [range.from.raw]
        : [range.from.raw, range.to.raw]
  return ['--end-of-options', ...revs]
}

/**
 * パスフィルタ用ディレクトリの末尾スラッシュを保証する (防御的二重化)。
 *
 * ADR 0054: 末尾 / の付与は service 層の normalizeDir が一次担当だが、
 * 将来別 service が直接 port を呼んだ場合の暴発回避として adapter でも保険を入れる。
 */
function ensureTrailingSlash(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`
}

/**
 * tree-commits ロジック用に、変更されたパスから immediate child name を抽出する。
 *
 * 例:
 * - dirPrefix='', path='src/foo.ts'        → 'src'
 * - dirPrefix='src/', path='src/foo.ts'    → 'foo.ts'
 * - dirPrefix='src/', path='src/sub/x.ts'  → 'sub'
 * - dirPrefix='src/', path='other/x.ts'    → null (対象外)
 */
function extractImmediateChildName(path: string, dirPrefix: string): string | null {
  if (dirPrefix !== '' && !path.startsWith(dirPrefix)) {
    return null
  }
  const remainder = path.slice(dirPrefix.length)
  if (remainder.length === 0) return null
  const slash = remainder.indexOf('/')
  return slash === -1 ? remainder : remainder.slice(0, slash)
}
