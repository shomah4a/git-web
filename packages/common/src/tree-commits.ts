/**
 * ツリービューのファイル単位最終コミット情報 DTO (ADR 0054)。
 *
 * /api/tree-commits のレスポンス wire format を定義する。
 */

/**
 * 1 エントリの最終コミット情報。
 *
 * - hash: 40 桁 SHA-1 (表示時に front 側で短縮する)
 * - date: UNIX epoch 秒 (タイムゾーン独立、ADR 0046 と同規約)
 * - subject: コミット subject (1 行目)
 */
export type LastCommitDto = {
  readonly hash: string
  readonly date: number
  readonly subject: string
}

/**
 * ディレクトリ直下のエントリ 1 件の最終コミット情報。
 *
 * - name: 直下エントリ名 (例: "src")
 * - lastCommit: 履歴未確定 / rename 直後 / max-count 到達などで未取得の場合 null
 */
export type TreeCommitDto = {
  readonly name: string
  readonly lastCommit: LastCommitDto | null
}

/**
 * /api/tree-commits レスポンス DTO。
 */
export type TreeCommitsResponseDto = {
  readonly entries: ReadonlyArray<TreeCommitDto>
}
