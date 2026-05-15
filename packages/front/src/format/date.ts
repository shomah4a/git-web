/**
 * UNIX epoch 秒を YYYY-MM-DD 形式に整形するユーティリティ (ADR 0054 §9)。
 *
 * 設計方針:
 * - 副作用 (現在時刻取得) を排除し、入力として epoch 秒のみを受け取る
 * - タイムゾーンは引数で受け取り、テストで再現性を確保する
 * - UI からは createYmdFormatter(timeZone) でクロージャを作って使い回す
 */

/**
 * 指定タイムゾーンで epoch 秒を YYYY-MM-DD 形式に整形する関数を返す。
 *
 * timeZone は IANA 名 (例: 'UTC', 'Asia/Tokyo')。
 */
export function createYmdFormatter(timeZone: string): (epochSec: number) => string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return (epochSec) => formatter.format(new Date(epochSec * 1000))
}

/**
 * ブラウザのローカル TZ で動作する formatter を生成する。
 *
 * UI コンポーネントから副作用なしで呼べるよう、TZ 取得を別関数に分離する。
 */
export function detectBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
