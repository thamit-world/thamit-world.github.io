// QR の行列(m0/qr-fixtures.json)の形(§5.7)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { qrFixturesPath } from './helpers.mjs'

const file = JSON.parse(readFileSync(qrFixturesPath, 'utf8'))

test('8通りで、名前が重ならない', () => {
  assert.equal(file.fixtures.length, 8)
  assert.equal(new Set(file.fixtures.map((fixture) => fixture.name)).size, 8)
})

test('QR の URL はすべて配信リポジトリの試験用ページで、thamit.app を含まない', () => {
  for (const { name, url } of file.fixtures) {
    assert.equal(url, `https://${file.org}.github.io/m0/qr/${name}.html?from=vrc-world-m0`)
    assert.ok(!url.includes('thamit.app'), url)
  }
})

test('modules は size × size ビットの16進', () => {
  for (const { size, modules } of file.fixtures) {
    assert.ok(Number.isInteger(size) && size >= 21 && (size - 17) % 4 === 0, String(size))
    assert.match(modules, /^[0-9a-f]+$/)
    assert.equal(modules.length, Math.ceil((size * size) / 4))
  }
})

test('余白なしの行列(左上に位置検出パターンの 7×7 の黒枠がある)', () => {
  for (const { size, modules } of file.fixtures) {
    const bits = [...modules].flatMap((hex) => parseInt(hex, 16).toString(2).padStart(4, '0').split('').map(Number))
    const at = (row, column) => bits[row * size + column]
    for (let index = 0; index < 7; index += 1) {
      assert.equal(at(0, index), 1)
      assert.equal(at(index, 0), 1)
      assert.equal(at(6, index), 1)
    }
    assert.equal(at(1, 1), 0)
  }
})
