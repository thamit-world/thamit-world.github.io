// 合成データの calendar.json を組み立てる(計画書 §6.3・§6.4・§6.10、手順書 §5.5)。
import { createHash } from 'node:crypto'
import { addDaysToIso, weekdayLabels, weekdayOfIso } from './dates.mjs'
import { byteLength, serialize } from './serialize.mjs'
import {
  eventNameFor,
  genres,
  joinMethodFor,
  pageNameFor,
  personNameFor,
  roles,
  sentencesUpTo,
  tagPool,
} from './text.mjs'

export const schemaName = 'thamit-vrchat-world-event-calendar/1'
export const dayCount = 29
export const partBudgetBytes = 280_000
export const partLimitBytes = 300_000
export const maximumPartCount = 4
export const sentinelSuffix = ',"end":true}'

// schedule.kind の割合の目安(§5.5)
const scheduleKindWeights = [
  ['weekly', 50],
  ['biweekly', 10],
  ['nth-weekday', 10],
  ['dates', 10],
  ['single', 10],
  ['undated', 5],
  ['daily', 5],
]

// 文章の長さの分布。normal は sixty が約50〜80KB になるように合わせた(§5.5)
export const textProfiles = {
  normal: { description: [20, 110], joinMethod: [20, 70], dailyWeight: 5 },
  long: { description: [160, 200], joinMethod: [220, 300], dailyWeight: 30 },
}

const startTimes = ['20:00', '20:30', '21:00', '21:00', '21:30', '22:00', '22:00', '22:30', '23:00', '23:30', '19:00', '00:00']

const referenceCodeFor = (seed, index) =>
  createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0, 6)

const offsetsForWeekday = (startDate, weekday) => {
  const offsets = []
  for (let offset = 0; offset < dayCount; offset += 1) {
    if (weekdayOfIso(addDaysToIso(startDate, offset)) === weekday) offsets.push(offset)
  }
  return offsets
}

// 第n曜日(範囲内の各月で、その月の第n週にあたる日)
const offsetsForNthWeekday = (startDate, weekday, nth) =>
  offsetsForWeekday(startDate, weekday).filter((offset) => {
    const dayOfMonth = Number(addDaysToIso(startDate, offset).slice(8, 10))
    return Math.ceil(dayOfMonth / 7) === nth
  })

const buildSchedule = (random, kind, startDate) => {
  const weekday = random.integer(0, 6)
  const ja = weekdayLabels.ja[weekday]
  const en = weekdayLabels.en[weekday]
  switch (kind) {
    case 'daily':
      return {
        schedule: { kind, label: { ja: '毎日', en: 'Every day' }, isBiweekly: false },
        dayOffsets: Array.from({ length: dayCount }, (_, offset) => offset),
      }
    case 'weekly':
      return {
        schedule: { kind, label: { ja: `毎週 ${ja}`, en: `Every ${en}` }, isBiweekly: false },
        dayOffsets: offsetsForWeekday(startDate, weekday),
      }
    case 'biweekly':
      // どちらの週かのデータがないので、該当する曜日すべてに展開する(計画書 §6.5・D28)
      return {
        schedule: { kind, label: { ja: `隔週 ${ja}`, en: `Every other ${en}` }, isBiweekly: true },
        dayOffsets: offsetsForWeekday(startDate, weekday),
      }
    case 'nth-weekday': {
      const nth = random.integer(1, 4)
      return {
        schedule: { kind, label: { ja: `第${nth} ${ja}`, en: `${['1st', '2nd', '3rd', '4th'][nth - 1]} ${en}` }, isBiweekly: false },
        dayOffsets: offsetsForNthWeekday(startDate, weekday, nth),
      }
    }
    case 'dates': {
      const count = random.integer(2, 5)
      const offsets = [...new Set(Array.from({ length: count }, () => random.integer(0, dayCount - 1)))].sort((a, b) => a - b)
      const datesAfterRange = random.chance(0.3) ? [addDaysToIso(startDate, dayCount + random.integer(3, 60))] : []
      return {
        schedule: { kind, label: { ja: '不定期', en: 'Irregular' }, isBiweekly: false },
        dayOffsets: offsets,
        datesAfterRange,
      }
    }
    case 'single': {
      // 3割は範囲より先の単発(先の予定)
      if (random.chance(0.3)) {
        return {
          schedule: { kind, label: { ja: '単発', en: 'One-time' }, isBiweekly: false },
          dayOffsets: [],
          datesAfterRange: [addDaysToIso(startDate, dayCount + random.integer(1, 90))],
        }
      }
      return {
        schedule: { kind, label: { ja: '単発', en: 'One-time' }, isBiweekly: false },
        dayOffsets: [random.integer(1, dayCount - 1)],
      }
    }
    case 'undated':
      return {
        schedule: { kind, label: { ja: '日程未定', en: 'Date TBD' }, isBiweekly: false },
        dayOffsets: [],
        usualWeekdays: random.chance(0.6) ? [weekday] : [],
      }
    default:
      throw new Error(`知らない schedule.kind: ${kind}`)
  }
}

const buildPages = (random, pageCount, qrFixtures, genreKeys) =>
  Array.from({ length: pageCount }, (_, pageIndex) => {
    const number = pageIndex + 1
    const isPerson = random.chance(0.35)
    const genreKey = genreKeys[pageIndex % genreKeys.length]
    const fixture = qrFixtures[pageIndex % qrFixtures.length]
    return {
      pageIndex,
      displayName: isPerson ? personNameFor(number) : pageNameFor(genreKey, number).ja,
      pageUrlText: `thamit.app/sample-${String(number).padStart(3, '0')}`,
      qrCode: { size: fixture.size, modules: fixture.modules },
      // 以下は組み立て用の内部の値で、直列化しない
      internalGenreKey: genreKey,
      internalNumber: number,
      internalIsPerson: isPerson,
    }
  })

const rangeLength = (random, [minimum, maximum]) => random.integer(minimum, maximum)

// pages と events を作る。events の listings は pageIndex で pages を指す
export const buildContent = ({ random, seed, eventCount, pageCount, textProfile, startDate, qrFixtures }) => {
  const profile = textProfiles[textProfile]
  const genreKeys = genres.map((genre) => genre.key)
  const pages = buildPages(random, pageCount, qrFixtures, genreKeys)
  const kindWeights = scheduleKindWeights.map(([kind, weight]) => [kind, kind === 'daily' ? profile.dailyWeight : weight])

  const events = Array.from({ length: eventCount }, (_, index) => {
    const representative = pages.length > 0 ? pages[index % pages.length] : null
    const genre = random.chance(0.1) ? null : (representative?.internalGenreKey ?? random.pick(genreKeys))
    const baseName = pageNameFor(genre ?? 'other', representative?.internalNumber ?? index + 1)
    const hasEnglish = random.chance(0.3)
    const isHostListing = !representative?.internalIsPerson && random.chance(0.85)
    const kind = random.weighted(kindWeights)
    const { schedule, dayOffsets, datesAfterRange = [], usualWeekdays = [] } = buildSchedule(random, kind, startDate)

    const name = eventNameFor(random, baseName)
    const description = random.chance(0.9) ? sentencesUpTo(random, rangeLength(random, profile.description), 200) : null
    const joinMethod = isHostListing ? joinMethodFor(random, rangeLength(random, profile.joinMethod), 300) : null
    const localized = (value) => (value === null ? null : hasEnglish ? { ja: value.ja, en: value.en } : { ja: value.ja })

    const listingCount = pages.length > 1 ? random.weighted([[1, 60], [2, 25], [3, 15]]) : 1
    const others = random.sample(
      pages.filter((page) => page !== representative),
      listingCount - 1,
    )
    const listings = representative
      ? [
          {
            pageIndex: representative.pageIndex,
            role: isHostListing ? roles.host : random.pick([roles.cast, roles.performer, null]),
            castName: null,
          },
          ...others.map((page) => {
            const isCast = random.chance(0.6)
            const listing = {
              pageIndex: page.pageIndex,
              role: isCast ? roles.cast : random.pick([roles.performer, roles.dj, roles.staff]),
              castName: isCast ? { ja: `仮名${page.internalNumber % 100}`, en: `Alias${page.internalNumber % 100}` } : null,
            }
            // 出演予定が代表の日程の一部だけの人(イベントと同じなら省く=§6.4)
            if (dayOffsets.length > 1 && random.chance(0.4)) {
              listing.dayOffsets = dayOffsets.filter((_, offsetIndex) => offsetIndex % 2 === 0)
            }
            return listing
          }),
        ]
      : []

    return {
      eventIndex: index,
      referenceCode: referenceCodeFor(seed, index),
      name: hasEnglish ? name : { ja: name.ja },
      genre,
      tags: random.sample(tagPool, random.integer(0, 3)),
      description: localized(description),
      joinMethod: localized(joinMethod),
      hashtag: isHostListing && random.chance(0.7) ? baseName.ja.replace(/\s/g, '') : null,
      xUsername: isHostListing && random.chance(0.6) ? `sample_${String(representative?.internalNumber ?? index).padStart(3, '0')}` : null,
      startTime: random.chance(0.1) ? null : random.pick(startTimes),
      schedule,
      dayOffsets,
      usualWeekdays,
      datesAfterRange,
      listings,
    }
  })

  return { pages, events }
}

// 分割の並び:最も早い開催日の順。範囲より先だけのものはその後、日程未定は最後(計画書 §6.10)
const sortKey = (event, startDate) => {
  if (event.dayOffsets.length > 0) return event.dayOffsets[0]
  if (event.datesAfterRange.length > 0) {
    return 1000 + (Date.parse(event.datesAfterRange[0]) - Date.parse(startDate)) / 86_400_000
  }
  return 1_000_000
}

export const publicPage = ({ pageIndex, displayName, pageUrlText, qrCode }) => ({ pageIndex, displayName, pageUrlText, qrCode })

// events を並べ替えて、各パートに詰める。eventIndex は並べ替えたあとの順に振り直す
export const packParts = ({ pages, events, startDate, budgetBytes = partBudgetBytes, maximumParts = maximumPartCount, genresBytes }) => {
  const sorted = events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => sortKey(a.event, startDate) - sortKey(b.event, startDate) || a.order - b.order)
    .map(({ event }, eventIndex) => ({ ...event, eventIndex }))

  const pageBytes = new Map(pages.map((page) => [page.pageIndex, byteLength(serialize(publicPage(page)))]))
  // 全体のキー(contentHash・range など)と配列の括弧のぶん。値の桁の違いは予算の余裕で吸収する
  const headerBytes = 1_000
  const parts = []
  let current = null
  let omittedEventCount = 0

  const startPart = () => {
    current = { events: [], pageIndexes: new Set(), bytes: headerBytes + (parts.length === 0 ? genresBytes : 0) }
    parts.push(current)
  }
  startPart()

  for (const event of sorted) {
    const eventBytes = byteLength(serialize(event)) + 1
    const newPageBytes = (part) =>
      event.listings
        .filter((listing) => !part.pageIndexes.has(listing.pageIndex))
        .reduce((sum, listing) => sum + pageBytes.get(listing.pageIndex) + 1, 0)
    if (current.bytes + eventBytes + newPageBytes(current) > budgetBytes && current.events.length > 0) {
      if (parts.length >= maximumParts) {
        omittedEventCount += 1
        continue
      }
      startPart()
    }
    current.bytes += eventBytes + newPageBytes(current)
    for (const listing of event.listings) current.pageIndexes.add(listing.pageIndex)
    current.events.push(event)
  }

  const pageByIndex = new Map(pages.map((page) => [page.pageIndex, publicPage(page)]))
  return {
    omittedEventCount,
    parts: parts.map((part) => ({
      events: part.events,
      pages: [...part.pageIndexes].sort((a, b) => a - b).map((pageIndex) => pageByIndex.get(pageIndex)),
    })),
  }
}

export const genresBytesFor = (genreList) => byteLength(serialize(genreList)) + 12

// 1パートの本体(キーの順は §6.3 の例のとおり。contentHash が先頭、end が最後)
export const partObject = ({ header, partIndex, partCount, part, genreList, extraBeforeEnd = {}, includeEnd = true }) => {
  const object = {
    contentHash: header.contentHash,
    schema: header.schema,
    status: header.status,
    revision: header.revision,
    partIndex,
    partCount,
    generatedAt: header.generatedAt,
    expiresAtUnixSeconds: header.expiresAtUnixSeconds,
    minimumWorldBuild: header.minimumWorldBuild,
    refreshSeconds: header.refreshSeconds,
    notice: header.notice,
    range: header.range,
    omittedEventCount: header.omittedEventCount,
  }
  if (partIndex === 0) object.genres = genreList
  object.pages = part?.pages ?? []
  object.events = part?.events ?? []
  Object.assign(object, extraBeforeEnd)
  if (includeEnd) object.end = true
  return object
}

// contentHash:generatedAt・expiresAtUnixSeconds・revision(と contentHash 自身)を除いた
// 全パートの中身の SHA-256 の先頭16桁(§5.5)
export const contentHashOf = (partObjects) => {
  const hash = createHash('sha256')
  for (const object of partObjects) {
    const { contentHash, generatedAt, expiresAtUnixSeconds, revision, ...rest } = object
    hash.update(serialize(rest))
    hash.update('\n')
  }
  return hash.digest('hex').slice(0, 16)
}
