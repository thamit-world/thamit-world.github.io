// 配信ファイルの形の検証(§5.7。計画書 §5.4 の verify.mjs と同じ規則)
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { partLimitBytes, sentinelSuffix } from '../lib/calendar.mjs'
import { datasets, partFileName } from '../lib/datasets.mjs'
import { nastyItems, plainText } from '../lib/nasty.mjs'
import { EscapedString, RawString, serialize } from '../lib/serialize.mjs'
import { renderSite } from '../lib/site.mjs'
import { findUnescapedCharacters, verifyParts, verifySite } from '../lib/verify.mjs'
import { fixedNow, qrFixtures, seed } from './helpers.mjs'

const { files, stats } = renderSite({ now: fixedNow, seed, revision: 42, activeDataset: 'sixty', qrFixtures })
const partsOf = (directory) => [0, 1, 2, 3].map((partIndex) => files.get(`${directory}/${partFileName(partIndex)}`) ?? null)
const parse = (path) => JSON.parse(files.get(path).toString('utf8'))
const lineSeparatorBytes = Buffer.from([0xe2, 0x80, 0xa8])
const paragraphSeparatorBytes = Buffer.from([0xe2, 0x80, 0xa9])

describe('サイト全体', () => {
  test('verifySite がすべて通る', () => {
    assert.deepEqual(verifySite(files, { datasets }), [])
  })

  test('/v1/events/ はちょうど4本', () => {
    assert.deepEqual(
      [...files.keys()].filter((path) => path.startsWith('v1/')),
      ['v1/events/calendar.json', 'v1/events/calendar-part-1.json', 'v1/events/calendar-part-2.json', 'v1/events/calendar-part-3.json'],
    )
  })

  test('許可リストにないパスを見つける', () => {
    const extra = new Map(files)
    extra.set('v1/events/other.json', Buffer.from('{}'))
    extra.set('.nojekyll', Buffer.from(''))
    const errors = verifySite(extra, { datasets })
    assert.ok(errors.some((error) => error.startsWith('v1/events/other.json')))
    assert.ok(errors.some((error) => error.startsWith('.nojekyll')))
  })

  test('1本 300,000 バイト以下(ios-800k・ios-1200k を除く)', () => {
    for (const [path, body] of files) {
      if (!path.endsWith('.json') || /ios-(800k|1200k)/.test(path)) continue
      assert.ok(body.length <= partLimitBytes, `${path} ${body.length}`)
    }
  })

  test('UTF-8 で BOM がない', () => {
    for (const [path, body] of files) {
      if (!path.endsWith('.json') && !path.endsWith('.html')) continue
      assert.notDeepEqual([...body.subarray(0, 3)], [0xef, 0xbb, 0xbf], path)
    }
  })

  test('QR の行き先の静的ページは thamit.app を含まない', () => {
    const qrPaths = [...files.keys()].filter((path) => path.startsWith('m0/qr/'))
    assert.equal(qrPaths.length, 8)
    for (const path of qrPaths) assert.ok(!files.get(path).includes('thamit.app'), path)
  })

  test('probe-256.png は PNG', () => {
    assert.deepEqual([...files.get('m0/image/probe-256.png').subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })
})

describe('データセットの大きさ(§5.4)', () => {
  test('sixty は約50〜80KB・1本', () => {
    const bytes = files.get('m0/sixty/calendar.json').length
    assert.ok(bytes >= 50_000 && bytes <= 80_000, String(bytes))
    assert.equal(stats.get('sixty').partCount, 1)
    assert.equal(stats.get('sixty').eventCount, 60)
    assert.equal(stats.get('sixty').pageCount, 26)
  })

  test('five-hundred は約0.4〜0.9MB・2〜4本、各パートが 300,000 バイト以下', () => {
    const { partCount, eventCount, omittedEventCount } = stats.get('five-hundred')
    const total = partsOf('m0/five-hundred').reduce((sum, body) => sum + body.length, 0)
    assert.ok(total >= 400_000 && total <= 900_000, String(total))
    assert.ok(partCount >= 2 && partCount <= 4)
    assert.equal(eventCount + omittedEventCount, 500)
  })

  test('five-hundred-long は4本の上限に届き omittedEventCount ≥ 1', () => {
    assert.equal(stats.get('five-hundred-long').partCount, 4)
    assert.ok(stats.get('five-hundred-long').omittedEventCount >= 1)
  })

  test('ios-300k は 295,000〜299,999 バイト、ios-800k・ios-1200k は目標ちょうど', () => {
    const ios300 = files.get('m0/ios-300k/calendar.json').length
    assert.ok(ios300 >= 295_000 && ios300 <= 299_999, String(ios300))
    assert.equal(files.get('m0/ios-800k/calendar.json').length, 800_000)
    assert.equal(files.get('m0/ios-1200k/calendar.json').length, 1_200_000)
  })

  test('状態系のデータセットの中身', () => {
    assert.equal(parse('m0/paused/calendar.json').status, 'paused')
    assert.equal(parse('m0/ended/calendar.json').status, 'ended')
    assert.equal(parse('m0/unknown-status/calendar.json').status, 'maintenance')
    assert.ok(parse('m0/expired/calendar.json').expiresAtUnixSeconds < fixedNow.getTime() / 1000)
    assert.equal(parse('m0/old-world/calendar.json').minimumWorldBuild, 999)
    assert.equal(parse('m0/schema-v2/calendar.json').schema, 'thamit-vrchat-world-event-calendar/2')
    assert.equal(parse('m0/bad-offset/calendar.json').range.utcOffsetMinutes, 0)
    assert.equal(parse('m0/stale-range/calendar.json').range.startDate, '2026-09-10') // JST 2026-10-20 の40日前
    assert.equal(parse('m0/empty/calendar.json').events.length, 0)
    assert.ok(!files.get('m0/no-sentinel/calendar.json').toString('utf8').endsWith(sentinelSuffix))
    assert.throws(() => parse('m0/cut/calendar.json'))
    assert.equal(files.has('m0/part-missing/calendar-part-1.json'), false)
    assert.equal(files.has('m0/missing/calendar.json'), false)
    const mismatch = [0, 1].map((partIndex) => parse(`m0/part-mismatch/${partFileName(partIndex)}`))
    assert.equal(mismatch[0].partCount, 2)
    assert.notEqual(mismatch[0].contentHash, mismatch[1].contentHash)
    assert.equal(parse('m0/part-missing/calendar.json').partCount, 2)
  })

  test('全体のキーの値(§5.5)', () => {
    const calendar = parse('m0/sixty/calendar.json')
    assert.equal(Object.keys(calendar)[0], 'contentHash')
    assert.equal(Object.keys(calendar).at(-1), 'end')
    assert.match(calendar.contentHash, /^[0-9a-f]{16}$/)
    assert.equal(calendar.revision, 42)
    assert.deepEqual(calendar.range, { startDate: '2026-10-19', dayCount: 29, utcOffsetMinutes: 540 })
    assert.equal(calendar.expiresAtUnixSeconds, fixedNow.getTime() / 1000 + 72 * 3600)
    assert.equal(calendar.generatedAt, '2026-10-20T03:15:00Z')
    assert.deepEqual(
      calendar.genres.map((genre) => genre.key),
      ['cafe-bar', 'club-music', 'gathering', 'study', 'photo-session', 'other'],
    )
  })
})

describe('文字列のエスケープ(計画書 §6.9)', () => {
  test('serialize は括弧と U+2028・U+2029 をエスケープする', () => {
    assert.equal(serialize('[a]{b}<c>'), '"\\u005ba\\u005d\\u007bb\\u007d\\u003cc\\u003e"')
    assert.equal(serialize(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}`), '"a\\u2028b\\u2029"')
    assert.equal(serialize(new RawString('[a]')), '"[a]"')
    assert.equal(serialize(new EscapedString('あ𠮷"')), '"\\u3042\\ud842\\udfb7\\""')
    assert.equal(serialize({ a: [1, true, null], b: 'x' }), '{"a":[1,true,null],"b":"x"}')
  })

  test('nasty 以外のファイルに、生の括弧と U+2028・U+2029 がない', () => {
    for (const [path, body] of files) {
      if (!path.endsWith('.json') || path.includes('/nasty/') || path.startsWith('v1/') || path.includes('/cut/')) continue
      assert.deepEqual(findUnescapedCharacters(body.toString('utf8')), [], path)
      assert.equal(body.includes(lineSeparatorBytes) || body.includes(paragraphSeparatorBytes), false, path)
    }
  })

  test('nasty で生の括弧が残るのは brackets-raw だけ', () => {
    const body = files.get('m0/nasty/calendar.json')
    assert.deepEqual([...new Set(findUnescapedCharacters(body.toString('utf8')))], ['[特別]{集会}<告知>'])
    const raw = body.toString('utf8')
    assert.ok(raw.includes('"[特別]{集会}<告知>"'))
    assert.ok(raw.includes('\\u3042\\u3044\\ud842\\udfb7'))
    assert.equal(body.includes(lineSeparatorBytes), false)
  })

  test('nasty の m0Checks は、読んだ値の UTF-16 の長さと、イベントの欄の値に一致する', () => {
    const calendar = parse('m0/nasty/calendar.json')
    assert.equal(calendar.m0Checks.length, nastyItems.length)
    for (const check of calendar.m0Checks) {
      assert.equal(check.value.length, check.expectedUtf16Length, check.id)
      const event = calendar.events.find((candidate) => candidate.eventIndex === check.eventIndex)
      assert.equal(event[check.field].ja, check.value, check.id)
      assert.equal(check.value, plainText(nastyItems.find((item) => item.id === check.id).value), check.id)
    }
    assert.equal(calendar.m0Checks.find((check) => check.id === 'brackets-raw').expectedUtf16Length, 12)
    assert.equal(calendar.m0Checks.find((check) => check.id === 'literal-backslash-n').value, '1行目\\n2行目')
  })
})

describe('中身の規則', () => {
  test('dayOffsets が 0〜28 の昇順・listings[].pageIndex が同じパートの pages[] にある', () => {
    // verifyParts が見る規則を、全データセットで確かめる
    for (const dataset of datasets) {
      if (dataset.noFiles || dataset.verify?.cut) continue
      assert.deepEqual(verifyParts(partsOf(`m0/${dataset.name}`), dataset.verify, dataset.name), [], dataset.name)
    }
  })

  test('schedule.kind の割合がおおむね目安どおり(five-hundred)', () => {
    const counts = {}
    for (const body of partsOf('m0/five-hundred')) {
      for (const event of JSON.parse(body.toString('utf8')).events) counts[event.schedule.kind] = (counts[event.schedule.kind] ?? 0) + 1
    }
    assert.ok(counts.weekly > 180 && counts.weekly < 320, JSON.stringify(counts))
    for (const kind of ['biweekly', 'nth-weekday', 'dates', 'single', 'undated', 'daily']) assert.ok(counts[kind] > 0, kind)
  })

  test('英語訳は3割ほど', () => {
    const events = parse('m0/sixty/calendar.json').events
    const withEnglish = events.filter((event) => event.name.en).length
    assert.ok(withEnglish >= 6 && withEnglish <= 30, String(withEnglish))
  })

  test('パートは開催日の早い順で、日程未定は最後', () => {
    const events = partsOf('m0/five-hundred').flatMap((body) => JSON.parse(body.toString('utf8')).events)
    const firstUndated = events.findIndex((event) => event.schedule.kind === 'undated')
    assert.ok(events.slice(firstUndated).every((event) => event.dayOffsets.length === 0))
    const dated = events.filter((event) => event.dayOffsets.length > 0).map((event) => event.dayOffsets[0])
    assert.deepEqual(dated, [...dated].sort((a, b) => a - b))
  })
})

describe('verifyParts が壊れたものを見つける', () => {
  const good = partsOf('m0/sixty')

  test('BOM', () => {
    const withBom = [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good[0]]), ...good.slice(1)]
    assert.ok(verifyParts(withBom).some((error) => error.includes('BOM')))
  })

  test('番兵なし・途中切れ・ファイルなし・大きすぎ', () => {
    assert.ok(verifyParts(partsOf('m0/no-sentinel')).some((error) => error.includes('で終わらない')))
    assert.ok(verifyParts(partsOf('m0/cut')).some((error) => error.includes('JSON として読めない')))
    assert.ok(verifyParts(partsOf('m0/part-missing')).some((error) => error.includes('ファイルがない')))
    assert.ok(verifyParts(partsOf('m0/ios-800k')).some((error) => error.includes('300,000 を超える')))
  })

  test('contentHash の不一致・schema のメジャー版', () => {
    assert.ok(verifyParts(partsOf('m0/part-mismatch')).some((error) => error.includes('contentHash が違う')))
    assert.ok(verifyParts(partsOf('m0/schema-v2')).some((error) => error.includes('schema が違う')))
  })

  test('エスケープしていない括弧', () => {
    assert.ok(verifyParts(partsOf('m0/nasty')).some((error) => error.includes('エスケープしていない括弧')))
  })
})
