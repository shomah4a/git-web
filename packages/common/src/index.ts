/**
 * 対象 git リポジトリの基本情報。
 *
 * - cwd: git-web を起動したときの作業ディレクトリ（絶対パス）
 * - head: HEAD が指すコミットの SHA-1 ハッシュ
 */
export type RepoInfo = {
  readonly cwd: string
  readonly head: string
}
