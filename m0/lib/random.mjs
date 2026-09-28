// 種を固定できる乱数(mulberry32)。同じ種なら同じ並びを返す(§5.1 の再現性)。
import { createHash } from 'node:crypto'

export const createRandom = (seed) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const integer = (minimum, maximum) => minimum + Math.floor(next() * (maximum - minimum + 1))
  const pick = (list) => list[Math.floor(next() * list.length)]
  const chance = (probability) => next() < probability
  // 重みつきの選択。entries は [値, 重み] の並び
  const weighted = (entries) => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    let threshold = next() * total
    for (const [value, weight] of entries) {
      threshold -= weight
      if (threshold < 0) return value
    }
    return entries[entries.length - 1][0]
  }
  const sample = (list, count) => {
    const copy = [...list]
    const result = []
    while (result.length < count && copy.length > 0) {
      result.push(copy.splice(Math.floor(next() * copy.length), 1)[0])
    }
    return result
  }
  return { next, integer, pick, chance, weighted, sample }
}

// データセット名などの文字列から、種に混ぜる整数を作る
export const seedFromText = (baseSeed, text) =>
  (baseSeed ^ createHash('sha256').update(text).digest().readUInt32BE(0)) >>> 0
