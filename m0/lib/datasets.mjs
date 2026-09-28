// データセットの定義と、1データセット分のファイルの組み立て(§5.3・§5.4)。
import {
  buildContent,
  contentHashOf,
  genresBytesFor,
  maximumPartCount,
  packParts,
  partBudgetBytes,
  partObject,
  publicPage,
  schemaName,
  dayCount,
} from './calendar.mjs'
import { addDaysToIso, isoSeconds, jstDateIso } from './dates.mjs'
import { nastyItems, plainText } from './nasty.mjs'
import { createRandom, seedFromText } from './random.mjs'
import { byteLength, serialize } from './serialize.mjs'
import { genres } from './text.mjs'

const expirySeconds = 72 * 60 * 60

// 状態系のデータセットに使う小さな中身
const small = { eventCount: 12, pageCount: 8, textProfile: 'normal' }

// verify は検証(verify.mjs)で緩める規則。state は M0 の記録用(ワールドで期待する状態)
export const datasets = [
  { name: 'sixty', eventCount: 60, pageCount: 26, textProfile: 'normal', state: 'Ready' },
  { name: 'sixty-alt', eventCount: 60, pageCount: 26, textProfile: 'normal', state: 'Ready' },
  { name: 'five-hundred', eventCount: 500, pageCount: 500, textProfile: 'normal', state: 'Ready' },
  { name: 'five-hundred-long', eventCount: 500, pageCount: 500, textProfile: 'long', state: 'Ready' },
  { name: 'empty', eventCount: 0, pageCount: 0, textProfile: 'normal', state: 'Ready(0件)' },
  { name: 'ios-300k', targetBytes: 297_500, textProfile: 'normal', state: 'Ready' },
  { name: 'ios-800k', targetBytes: 800_000, textProfile: 'normal', state: 'E06(iOS で途中切れなら)', verify: { oversize: true } },
  { name: 'ios-1200k', targetBytes: 1_200_000, textProfile: 'normal', state: 'E06(iOS で途中切れなら)', verify: { oversize: true } },
  { name: 'nasty', ...small, nasty: true, state: 'Ready+m0Checks', verify: { rawBrackets: true } },
  {
    name: 'paused',
    eventCount: 0,
    pageCount: 0,
    textProfile: 'normal',
    header: { status: 'paused', notice: { ja: '準備中です(M0 の試験)', en: 'Preparing (M0 test)' } },
    state: 'E04',
  },
  {
    name: 'ended',
    eventCount: 0,
    pageCount: 0,
    textProfile: 'normal',
    header: { status: 'ended', notice: { ja: 'thamit のワールド表示は終了しました(M0 の試験)', en: 'thamit world display has ended (M0 test)' } },
    state: 'E09',
  },
  { name: 'unknown-status', ...small, header: { status: 'maintenance' }, state: 'E04' },
  { name: 'expired', ...small, expiresOffsetSeconds: -3600, state: 'E07' },
  { name: 'old-world', ...small, header: { minimumWorldBuild: 999 }, state: 'E05' },
  { name: 'schema-v2', ...small, header: { schema: 'thamit-vrchat-world-event-calendar/2' }, state: 'E05', verify: { schema: true } },
  { name: 'bad-offset', ...small, rangeOverride: { utcOffsetMinutes: 0 }, state: 'E06' },
  { name: 'stale-range', ...small, startDateOffsetDays: -40, state: 'E08' },
  { name: 'no-sentinel', ...small, noSentinel: true, state: 'E06', verify: { sentinel: true } },
  { name: 'cut', eventCount: 60, pageCount: 26, textProfile: 'normal', cutRatio: 0.6, state: 'E06', verify: { cut: true } },
  { name: 'part-mismatch', eventCount: 24, pageCount: 12, textProfile: 'normal', splitInto: 2, mismatchPart: 1, state: 'E10', verify: { hash: true } },
  { name: 'part-missing', eventCount: 24, pageCount: 12, textProfile: 'normal', splitInto: 2, missingParts: [1], state: 'E10', verify: { missing: true } },
  { name: 'missing', noFiles: true, state: 'E02' },
]

export const datasetNames = datasets.map((dataset) => dataset.name)
export const datasetByName = (name) => datasets.find((dataset) => dataset.name === name)

// /v1/events/ に置いてよいデータセット(本番のパスは4本ちょうど・厳しい検証を通るもの)
export const activeDatasetNames = ['sixty', 'sixty-alt', 'five-hundred', 'five-hundred-long', 'empty', 'paused', 'ended', 'nasty']

export const partFileName = (partIndex) => (partIndex === 0 ? 'calendar.json' : `calendar-part-${partIndex}.json`)

// volatile が true のときは generatedAt・expiresAtUnixSeconds・revision を固定の値にする(siteHash 用=§5.6)
const buildHeader = ({ dataset, now, revision, volatile, omittedEventCount, startDate }) => ({
  contentHash: '',
  schema: schemaName,
  status: 'active',
  revision: volatile ? 0 : revision,
  generatedAt: volatile ? '1970-01-01T00:00:00Z' : isoSeconds(now),
  expiresAtUnixSeconds: volatile ? 0 : Math.floor(now.getTime() / 1000) + (dataset.expiresOffsetSeconds ?? expirySeconds),
  minimumWorldBuild: 1,
  refreshSeconds: 300,
  notice: null,
  range: { startDate, dayCount, utcOffsetMinutes: 540, ...dataset.rangeOverride },
  omittedEventCount,
  ...dataset.header,
})

const applyNasty = ({ content }) => {
  const nastyEvents = nastyItems.map((item, index) => {
    const base = content.events[index % content.events.length]
    const event = {
      ...structuredClone(base),
      referenceCode: `ba${String(index).padStart(4, '0')}`,
      dayOffsets: [1],
      schedule: { kind: 'single', label: { ja: '単発', en: 'One-time' }, isBiweekly: false },
      datesAfterRange: [],
      usualWeekdays: [],
    }
    if (item.field === 'name') event.name = { ja: item.value }
    if (item.field === 'description') event.description = { ja: item.value }
    if (item.field === 'joinMethod') event.joinMethod = { ja: item.value }
    return event
  })
  return { pages: content.pages, events: [...content.events, ...nastyEvents] }
}

const m0ChecksFor = (events) =>
  nastyItems.map((item, index) => {
    const event = events.find((candidate) => candidate.referenceCode === `ba${String(index).padStart(4, '0')}`)
    return {
      id: item.id,
      eventIndex: event.eventIndex,
      field: item.field,
      value: item.value,
      expectedUtf16Length: plainText(item.value).length,
    }
  })

const serializedPartBytes = (parts) => parts.map((object) => byteLength(serialize(object)))

// 1本のファイルを targetBytes ちょうどにする(ios-*)。イベントを減らして収め、
// 残りを m0Padding(ワールドは知らないキーを無視する)で埋める
const fitToTarget = ({ dataset, content, header: baseHeader, genreList }) => {
  // contentHash は最後に16桁が入るので、同じ長さの仮の値で測る
  const header = { ...baseHeader, contentHash: '0'.repeat(16) }
  const paddingOverhead = byteLength(',"m0Padding":""')
  const render = (eventCount) => {
    const events = content.events.slice(0, eventCount)
    const { parts } = packParts({ pages: content.pages, events, startDate: header.range.startDate, budgetBytes: Infinity, maximumParts: 1, genresBytes: 0 })
    return parts[0]
  }
  let low = 0
  let high = content.events.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const part = render(middle)
    const bytes = byteLength(serialize(partObject({ header, partIndex: 0, partCount: 1, part, genreList })))
    if (bytes + paddingOverhead <= dataset.targetBytes) low = middle
    else high = middle - 1
  }
  const part = render(low)
  const bytes = byteLength(serialize(partObject({ header, partIndex: 0, partCount: 1, part, genreList })))
  return { part, padding: 'x'.repeat(dataset.targetBytes - bytes - paddingOverhead) }
}

// 1データセット分のファイルを作る。戻り値の files は { fileName, bytes(Buffer) } の並び
export const renderDataset = ({ dataset, now, seed, revision, qrFixtures, volatile }) => {
  if (dataset.noFiles) {
    return { files: [], stats: { eventCount: 0, pageCount: 0, partCount: 0, contentHash: null, omittedEventCount: 0 } }
  }
  const random = createRandom(seedFromText(seed, dataset.name))
  const jstToday = jstDateIso(now)
  const startDate = addDaysToIso(jstToday, dataset.startDateOffsetDays ?? -1)
  const genreList = genres
  const eventCount = dataset.targetBytes ? Math.ceil(dataset.targetBytes / 600) : dataset.eventCount
  const pageCount = dataset.targetBytes ? 300 : dataset.pageCount

  let content = buildContent({ random, seed, eventCount, pageCount, textProfile: dataset.textProfile, startDate, qrFixtures })
  if (dataset.nasty) content = applyNasty({ content })

  let partsContent
  let omittedEventCount = 0
  let padding = null
  if (dataset.targetBytes) {
    const header = buildHeader({ dataset, now, revision, volatile, omittedEventCount: 0, startDate })
    const fitted = fitToTarget({ dataset, content, header, genreList })
    partsContent = [fitted.part]
    padding = fitted.padding
  } else {
    let budgetBytes = partBudgetBytes
    let maximumParts = maximumPartCount
    if (dataset.splitInto) {
      const total = content.events.reduce((sum, event) => sum + byteLength(serialize(event)), 0) + content.pages.reduce((sum, page) => sum + byteLength(serialize(publicPage(page))), 0)
      // 1本目にだけ入る genres と、パートをまたいで重なる pages[] のぶんの余裕を足す
      budgetBytes = Math.ceil(total / dataset.splitInto) + 10_000
      maximumParts = dataset.splitInto
    }
    const packed = packParts({ ...content, startDate, budgetBytes, maximumParts, genresBytes: genresBytesFor(genreList) })
    partsContent = packed.parts.filter((part, index) => index === 0 || part.events.length > 0)
    omittedEventCount = packed.omittedEventCount
  }

  const partCount = partsContent.length
  const header = buildHeader({ dataset, now, revision, volatile, omittedEventCount, startDate })
  const extraFor = (partIndex) => {
    const extra = {}
    if (partIndex === 0 && dataset.nasty) extra.m0Checks = m0ChecksFor(partsContent.flatMap((part) => part.events))
    if (partIndex === 0 && padding !== null) extra.m0Padding = padding
    return extra
  }
  const objects = Array.from({ length: maximumPartCount }, (_, partIndex) =>
    partObject({
      header,
      partIndex,
      partCount,
      part: partsContent[partIndex],
      genreList,
      extraBeforeEnd: extraFor(partIndex),
      includeEnd: !(dataset.noSentinel && partIndex === 0),
    }),
  )
  header.contentHash = contentHashOf(objects)
  for (const [partIndex, object] of objects.entries()) {
    object.contentHash = dataset.mismatchPart === partIndex ? header.contentHash.split('').reverse().join('') : header.contentHash
  }

  const files = []
  for (const [partIndex, object] of objects.entries()) {
    if (dataset.missingParts?.includes(partIndex)) continue
    let bytes = Buffer.from(serialize(object), 'utf8')
    if (dataset.cutRatio && partIndex === 0) bytes = bytes.subarray(0, Math.floor(bytes.length * dataset.cutRatio))
    files.push({ fileName: partFileName(partIndex), bytes })
  }

  const allEvents = partsContent.flatMap((part) => part.events)
  const allPages = new Set(partsContent.flatMap((part) => part.pages.map((page) => page.pageIndex)))
  return {
    files,
    stats: {
      eventCount: allEvents.length,
      pageCount: allPages.size,
      partCount,
      contentHash: header.contentHash,
      omittedEventCount,
      partBytes: serializedPartBytes(objects.slice(0, partCount)),
    },
  }
}
