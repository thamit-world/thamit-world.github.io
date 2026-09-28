// 配信ファイルの直列化(計画書 §6.9)。空白なし・キーの挿入順を保つ。
// 文字列の中の [ ] { } < > と U+2028・U+2029 を \u エスケープする。
// 例外は M0 の nasty データセットだけで使う2つの包み:
//   RawString     … 括弧をエスケープしない(VRCJson が生の括弧を正しく読むかを見る)
//   EscapedString … ASCII 以外をすべて \uXXXX で書く(\u エスケープの解釈を見る)

export class RawString {
  constructor(value) {
    this.value = value
  }
}

export class EscapedString {
  constructor(value) {
    this.value = value
  }
}

const bracketEscapes = {
  '[': '\\u005b',
  ']': '\\u005d',
  '{': '\\u007b',
  '}': '\\u007d',
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const toUnicodeEscape = (codeUnit) => `\\u${codeUnit.toString(16).padStart(4, '0')}`

// JSON.stringify は文字列を二重引用符で囲み、制御文字・引用符・バックスラッシュを
// エスケープする。U+2028・U+2029 はエスケープしないので、ここで足す。
// エスケープ済みの \uXXXX の中に括弧は現れないので、文字単位の置き換えで安全。
const serializeString = (value) =>
  JSON.stringify(value).replace(/[[\]{}<>\u2028\u2029]/g, (character) => bracketEscapes[character])

const serializeRawString = (value) =>
  JSON.stringify(value).replace(/[\u2028\u2029]/g, (character) => bracketEscapes[character])

const serializeEscapedString = (value) => {
  let result = '"'
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit < 0x20 || codeUnit > 0x7e) {
      result += toUnicodeEscape(codeUnit)
    } else if (value[index] === '"' || value[index] === '\\') {
      result += `\\${value[index]}`
    } else if (bracketEscapes[value[index]]) {
      result += bracketEscapes[value[index]]
    } else {
      result += value[index]
    }
  }
  return `${result}"`
}

export const serialize = (value) => {
  if (value === null) return 'null'
  if (value instanceof RawString) return serializeRawString(value.value)
  if (value instanceof EscapedString) return serializeEscapedString(value.value)
  if (typeof value === 'string') return serializeString(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`直列化できない数値: ${value}`)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
  if (typeof value === 'object') {
    const members = []
    for (const [key, member] of Object.entries(value)) {
      if (member === undefined) continue
      members.push(`${serializeString(key)}:${serialize(member)}`)
    }
    return `{${members.join(',')}}`
  }
  throw new Error(`直列化できない値: ${typeof value}`)
}

export const byteLength = (text) => Buffer.byteLength(text, 'utf8')
