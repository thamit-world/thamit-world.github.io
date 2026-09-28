// m0/qr-fixtures.json を作る使い捨ての道具(§5.2)。
// ジェネレーターに QR の符号化を持たせない(依存を増やさない)ため、このファイルを
// リポジトリの外の一時フォルダにコピーし、そこで `npm install uqr@0.1.3`(thamit 本体と同じ版)
// をしてから実行する。組織名(D2)を変えたら作り直す(URL にホスト名が入るため)。
//
//   node make-qr-fixtures.mjs --org thamit-world --out <リポジトリ>/m0/qr-fixtures.json
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { encode } from 'uqr'

const { values } = parseArgs({
  options: {
    org: { type: 'string', default: 'thamit-world' },
    out: { type: 'string', default: 'qr-fixtures.json' },
  },
})

// 長さの違う名前を8通り(sample-3 から30字まで)。§5.1
const names = [
  'sample-3',
  'sample-12',
  'sample-cafe-7',
  'sample-meetup-042',
  'sample-lounge-night-15',
  'sample-long-name-page-0099',
  'sample-longest-page-name-0123',
  'sample-page-30-characters-long',
]

const toModulesHex = (data) => {
  const bits = data.flatMap((row) => row.map((isDark) => (isDark ? 1 : 0)))
  while (bits.length % 4 !== 0) bits.push(0)
  let hex = ''
  for (let index = 0; index < bits.length; index += 4) {
    hex += ((bits[index] << 3) | (bits[index + 1] << 2) | (bits[index + 2] << 1) | bits[index + 3]).toString(16)
  }
  return hex
}

const fixtures = names.map((name) => {
  const url = `https://${values.org}.github.io/m0/qr/${name}.html?from=vrc-world-m0`
  // 余白なし(border: 0)。ワールドが周囲に白4マスを足して描く(計画書 §6.4)
  const { size, data } = encode(url, { ecc: 'M', border: 0 })
  return { name, url, size, modules: toModulesHex(data) }
})

writeFileSync(
  values.out,
  `${JSON.stringify({ generator: 'uqr@0.1.3 encode(url, { ecc: "M", border: 0 })', org: values.org, fixtures }, null, 2)}\n`,
  'utf8',
)
console.log(fixtures.map(({ name, url, size }) => `${size}\t${url.length}\t${name}`).join('\n'))
