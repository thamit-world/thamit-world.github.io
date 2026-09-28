// nasty データセットの意地悪な文字列(§5.5 の表)。
// value が RawString なら括弧をエスケープせず、EscapedString なら ASCII 以外を \u で書く。
import { EscapedString, RawString } from './serialize.mjs'

const repeatToLength = (unit, length) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length)

export const nastyItems = [
  { id: 'kanji', field: 'name', value: '髙﨑邊𠮷 サンプル' },
  { id: 'symbols', field: 'description', value: '★ ♡ ♪ 〜 ① ・ 【】 ※ → ♥' },
  { id: 'fullwidth', field: 'name', value: 'ＡＢＣ１２３ サンプル' },
  { id: 'emoji-basic', field: 'name', value: '☕ 🍸 🎵 サンプル' },
  { id: 'emoji-zwj', field: 'description', value: '👨‍👩‍👧 🏳️‍🌈' },
  { id: 'emoji-skin', field: 'description', value: '👍🏽' },
  { id: 'emoji-flag', field: 'description', value: '🇯🇵' },
  { id: 'emoji-keycap', field: 'description', value: '1️⃣' },
  { id: 'variation-selector', field: 'description', value: '♡︎ ♥️' },
  { id: 'korean', field: 'description', value: '한국어 테스트' },
  { id: 'rtl', field: 'description', value: 'العربية' },
  { id: 'combining', field: 'description', value: 'か゚・é' },
  { id: 'rich-text-tags', field: 'description', value: '<b>太字</b><color=red>赤</color><size=200>大</size><noparse>' },
  // バックスラッシュ+n の2文字(JSON では \\n)。改行されずにそのまま出ること
  { id: 'literal-backslash-n', field: 'joinMethod', value: '1行目\\n2行目' },
  { id: 'real-newline', field: 'description', value: '1行目\n2行目' },
  { id: 'brackets-raw', field: 'name', value: new RawString('[特別]{集会}<告知>') },
  { id: 'brackets-escaped', field: 'name', value: '[特別]{集会}<告知>' },
  { id: 'unicode-escape', field: 'description', value: new EscapedString('あい𠮷') },
  { id: 'json-like', field: 'description', value: '{"x":{"y":"{"}}・[}' },
  { id: 'line-separator', field: 'description', value: '1行目\u20282行目\u20293行目' },
  { id: 'long-name', field: 'name', value: repeatToLength('長い名前のサンプル', 100) },
  { id: 'long-description', field: 'description', value: repeatToLength('長い説明のサンプルです。', 200) },
  { id: 'long-join', field: 'joinMethod', value: repeatToLength('長いJoin方法のサンプルです。', 300) },
]

export const plainText = (value) => (typeof value === 'string' ? value : value.value)
