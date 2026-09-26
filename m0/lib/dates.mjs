// JST の日付の計算(計画書 §6.5)。日付は 'YYYY-MM-DD' の文字列で扱う。

const jstOffsetMilliseconds = 9 * 60 * 60 * 1000
const dayMilliseconds = 24 * 60 * 60 * 1000

export const jstDateIso = (date) => new Date(date.getTime() + jstOffsetMilliseconds).toISOString().slice(0, 10)

export const addDaysToIso = (isoDate, days) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * dayMilliseconds).toISOString().slice(0, 10)

// 0=日〜6=土
export const weekdayOfIso = (isoDate) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()

// 秒を落とした ISO 8601(UTC)。例:2026-10-20T03:15:00Z
export const isoSeconds = (date) => `${date.toISOString().slice(0, 19)}Z`

export const weekdayLabels = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}
