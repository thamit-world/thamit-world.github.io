// 配信ファイルの検証(計画書 §5.4 の verify.mjs と同じ規則+手順書 §5.7)。
// 戻り値はエラーの文の配列(空なら合格)。
import { dayCount, partLimitBytes, maximumPartCount, sentinelSuffix } from './calendar.mjs'
import { partFileName } from './datasets.mjs'

const schemaPrefix = 'thamit-vrchat-world-event-calendar/'
const rawBracketAllowList = new Set(['[特別]{集会}<告知>'])

// JSON の本文を走査して、文字列リテラルの中に生の [ ] { } < > と U+2028・U+2029 がないかを見る
export const findUnescapedCharacters = (text) => {
  const problems = []
  let inString = false
  let start = 0
  let sawBracket = false
  let sawSeparator = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (!inString) {
      if (character === '"') {
        inString = true
        start = index
        sawBracket = false
        sawSeparator = false
      }
      continue
    }
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '"') {
      inString = false
      if (sawBracket || sawSeparator) {
        const literal = JSON.parse(text.slice(start, index + 1))
        problems.push(literal)
      }
      continue
    }
    if ('[]{}<>'.includes(character)) sawBracket = true
    if (character === '\u2028' || character === '\u2029') sawSeparator = true
  }
  return problems
}

const checkEvents = (object, label, errors) => {
  const pageIndexes = new Set(object.pages.map((page) => page.pageIndex))
  for (const page of object.pages) {
    const { size, modules } = page.qrCode ?? {}
    if (!Number.isInteger(size) || typeof modules !== 'string' || !/^[0-9a-f]+$/.test(modules) || modules.length !== Math.ceil((size * size) / 4)) {
      errors.push(`${label}: pages[${page.pageIndex}] の qrCode の形が違う`)
    }
  }
  for (const event of object.events) {
    const offsets = event.dayOffsets
    if (!offsets.every((offset, index) => Number.isInteger(offset) && offset >= 0 && offset < dayCount && (index === 0 || offsets[index - 1] < offset))) {
      errors.push(`${label}: events[${event.eventIndex}] の dayOffsets が 0〜${dayCount - 1} の昇順でない`)
    }
    for (const listing of event.listings) {
      if (!pageIndexes.has(listing.pageIndex)) errors.push(`${label}: events[${event.eventIndex}] の pageIndex ${listing.pageIndex} が同じパートの pages にない`)
    }
  }
}

// bodies は4本(パート0〜3)の Buffer。置かないパートは null。
// relax は datasets.mjs の verify(わざと壊したデータセットで緩める規則)
export const verifyParts = (bodies, relax = {}, label = '') => {
  const errors = []
  const parsed = []
  for (const [partIndex, body] of bodies.entries()) {
    const name = `${label}${partFileName(partIndex)}`
    if (body === null) {
      if (!relax.missing) errors.push(`${name}: ファイルがない`)
      parsed.push(null)
      continue
    }
    if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) errors.push(`${name}: BOM がある`)
    if (body.length > partLimitBytes && !relax.oversize) errors.push(`${name}: ${body.length} バイトで 300,000 を超える`)
    if (relax.cut && partIndex === 0) {
      parsed.push(null)
      continue
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    let object
    try {
      object = JSON.parse(text)
    } catch (error) {
      errors.push(`${name}: JSON として読めない(${error.message})`)
      parsed.push(null)
      continue
    }
    parsed.push(object)
    if (!text.endsWith(sentinelSuffix) && !(relax.sentinel && partIndex === 0)) errors.push(`${name}: 本文が ${sentinelSuffix} で終わらない`)
    if (typeof object.schema !== 'string' || !object.schema.startsWith(schemaPrefix) || (object.schema.slice(schemaPrefix.length).split('.')[0] !== '1' && !relax.schema)) {
      errors.push(`${name}: schema が違う(${object.schema})`)
    }
    if (object.partIndex !== partIndex) errors.push(`${name}: partIndex が ${object.partIndex}`)
    if (!Number.isInteger(object.partCount) || object.partCount < 1 || object.partCount > maximumPartCount) errors.push(`${name}: partCount が範囲外(${object.partCount})`)
    if (partIndex >= object.partCount && (object.events.length > 0 || object.pages.length > 0)) errors.push(`${name}: partCount を超えるパートに events か pages がある`)
    const unescaped = findUnescapedCharacters(text).filter((literal) => !(relax.rawBrackets && rawBracketAllowList.has(literal)))
    if (unescaped.length > 0) errors.push(`${name}: エスケープしていない括弧か U+2028・U+2029 がある(${unescaped.length}件)`)
    checkEvents(object, name, errors)
  }
  const present = parsed.filter((object) => object !== null)
  if (new Set(present.map((object) => object.partCount)).size > 1) errors.push(`${label}: パートごとに partCount が違う`)
  if (new Set(present.map((object) => object.revision)).size > 1) errors.push(`${label}: パートごとに revision が違う`)
  if (new Set(present.map((object) => object.contentHash)).size > 1 && !relax.hash) errors.push(`${label}: パートごとに contentHash が違う`)
  return errors
}

// サイト全体(Map<path, Buffer>)の検証。パスの許可リストと、各データセットの検証
export const verifySite = (files, { datasets }) => {
  const errors = []
  const datasetNames = new Set(datasets.map((dataset) => dataset.name))
  const allowed = (path) =>
    ['robots.txt', 'index.html', 'm0/manifest.json', 'm0/image/probe-256.png'].includes(path) ||
    /^v1\/events\/calendar(-part-[1-3])?\.json$/.test(path) ||
    /^m0\/qr\/[a-z0-9-]+\.html$/.test(path) ||
    (/^m0\/([a-z0-9-]+)\/calendar(-part-[1-3])?\.json$/.test(path) && datasetNames.has(path.split('/')[1]))
  for (const path of files.keys()) {
    if (!allowed(path)) errors.push(`${path}: 許可リストにないパス`)
  }
  const partBodies = (directory) => Array.from({ length: maximumPartCount }, (_, partIndex) => files.get(`${directory}/${partFileName(partIndex)}`) ?? null)
  // 本番のパスは4本ちょうど・緩めない
  errors.push(...verifyParts(partBodies('v1/events'), {}, 'v1/events/'))
  for (const dataset of datasets) {
    if (dataset.noFiles) continue
    errors.push(...verifyParts(partBodies(`m0/${dataset.name}`), dataset.verify, `m0/${dataset.name}/`))
  }
  for (const [path, body] of files) {
    if (!path.startsWith('m0/qr/')) continue
    if (body.includes('thamit.app/')) errors.push(`${path}: thamit.app を含む`)
  }
  if (!files.has('robots.txt')) errors.push('robots.txt がない')
  return errors
}
