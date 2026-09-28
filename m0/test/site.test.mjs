// 再現性・siteHash・--active keep・--mode build(§5.7)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderSite, siteHashOf, siteHashOfFiles } from '../lib/site.mjs'
import { fixedNow, generatorPath, qrFixtures, seed } from './helpers.mjs'

const temporaryRoot = mkdtempSync(join(tmpdir(), 'thamit-m0-test-'))
after(() => rmSync(temporaryRoot, { recursive: true, force: true }))

const hoursLater = (hours) => new Date(fixedNow.getTime() + hours * 3_600_000)

describe('再現性', () => {
  test('同じ種と同じ --now なら、全ファイルがバイト単位で一致する', () => {
    const first = renderSite({ now: fixedNow, seed, revision: 7, activeDataset: 'sixty', qrFixtures }).files
    const second = renderSite({ now: fixedNow, seed, revision: 7, activeDataset: 'sixty', qrFixtures }).files
    assert.deepEqual([...first.keys()], [...second.keys()])
    for (const [path, body] of first) assert.ok(body.equals(second.get(path)), path)
  })

  test('種が違えば中身が違う', () => {
    const first = renderSite({ now: fixedNow, seed, revision: 1, activeDataset: 'sixty', qrFixtures }).files
    const second = renderSite({ now: fixedNow, seed: seed + 1, revision: 1, activeDataset: 'sixty', qrFixtures }).files
    assert.ok(!first.get('m0/sixty/calendar.json').equals(second.get('m0/sixty/calendar.json')))
  })
})

describe('siteHash', () => {
  const base = siteHashOf({ now: fixedNow, seed, activeDataset: 'sixty', qrFixtures })

  test('--now を数時間ずらしても(JST の日付が同じ範囲で)同じ値', () => {
    // 12:15 JST → 17:15 JST
    assert.equal(siteHashOf({ now: hoursLater(5), seed, activeDataset: 'sixty', qrFixtures }), base)
  })

  test('JST の日付が変わると違う値(範囲が1日進む)', () => {
    // 12:15 JST → 翌日 0:15 JST
    assert.notEqual(siteHashOf({ now: hoursLater(12), seed, activeDataset: 'sixty', qrFixtures }), base)
  })

  test('--revision を変えても、書き出す本文は変わるが siteHash は同じ', () => {
    const first = renderSite({ now: fixedNow, seed, revision: 11, activeDataset: 'sixty', qrFixtures }).files
    const second = renderSite({ now: fixedNow, seed, revision: 22, activeDataset: 'sixty', qrFixtures }).files
    assert.ok(!first.get('m0/sixty/calendar.json').equals(second.get('m0/sixty/calendar.json')))
    assert.equal(siteHashOf({ now: fixedNow, seed, activeDataset: 'sixty', qrFixtures }), base)
  })

  test('--active を変えると違う値', () => {
    assert.notEqual(siteHashOf({ now: fixedNow, seed, activeDataset: 'sixty-alt', qrFixtures }), base)
  })

  test('データセットを1つ変える・/m0/qr/ のページを1つ変えると違う値', () => {
    const { files } = renderSite({ now: fixedNow, seed, revision: 0, activeDataset: 'sixty', qrFixtures, volatile: true })
    assert.equal(siteHashOfFiles(files, 'sixty'), base)

    const changedDataset = new Map(files)
    changedDataset.set('m0/empty/calendar.json', Buffer.concat([files.get('m0/empty/calendar.json'), Buffer.from(' ')]))
    assert.notEqual(siteHashOfFiles(changedDataset, 'sixty'), base)

    const qrPath = [...files.keys()].find((path) => path.startsWith('m0/qr/'))
    const changedQrPage = new Map(files)
    changedQrPage.set(qrPath, Buffer.from('changed'))
    assert.notEqual(siteHashOfFiles(changedQrPage, 'sixty'), base)
  })
})

const runGenerator = ({ publishedBase, active = 'keep', mode = 'refresh', now = fixedNow.toISOString() }) => {
  const out = mkdtempSync(join(temporaryRoot, 'out-'))
  const githubOutput = join(out, '..', `${out.split(/[\\/]/).at(-1)}-github-output.txt`)
  writeFileSync(githubOutput, '')
  execFileSync(
    process.execPath,
    [fileURLToPath(generatorPath), '--out', out, '--active', active, '--mode', mode, '--now', now, '--published-base', publishedBase, '--revision', '3'],
    { env: { ...process.env, GITHUB_OUTPUT: githubOutput }, stdio: 'pipe' },
  )
  const manifest = JSON.parse(readFileSync(join(out, 'm0', 'manifest.json'), 'utf8'))
  const outputs = Object.fromEntries(
    readFileSync(githubOutput, 'utf8')
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
  return { out, manifest, outputs }
}

const publishedFolder = (manifest) => {
  const folder = mkdtempSync(join(temporaryRoot, 'published-'))
  if (manifest) {
    mkdirSync(join(folder, 'm0'), { recursive: true })
    writeFileSync(join(folder, 'm0', 'manifest.json'), JSON.stringify(manifest))
  }
  return folder
}

describe('CLI(ネットワークなし。--published-base にローカルのフォルダを渡す)', () => {
  test('--active keep は公開中の manifest の activeDataset を引き継ぐ', () => {
    const { manifest, outputs } = runGenerator({ publishedBase: publishedFolder({ activeDataset: 'five-hundred', siteHash: 'x' }) })
    assert.equal(manifest.activeDataset, 'five-hundred')
    assert.match(outputs.summary, /activeDataset=five-hundred/)
  })

  test('--active keep で manifest がないときは sixty', () => {
    const { manifest } = runGenerator({ publishedBase: publishedFolder(null) })
    assert.equal(manifest.activeDataset, 'sixty')
  })

  test('--mode build は公開中の siteHash と同じなら changed=false、違えば true', () => {
    const first = runGenerator({ publishedBase: publishedFolder(null), active: 'sixty', mode: 'build' })
    assert.equal(first.outputs.changed, 'true')
    // 同じ日の数時間後に、公開中の manifest を相手に build する
    const later = hoursLater(3).toISOString()
    const same = runGenerator({ publishedBase: first.out, mode: 'build', now: later })
    assert.equal(same.outputs.changed, 'false')
    const differentDataset = runGenerator({ publishedBase: first.out, active: 'sixty-alt', mode: 'build', now: later })
    assert.equal(differentDataset.outputs.changed, 'true')
  })

  test('--mode refresh は常に changed=true', () => {
    const first = runGenerator({ publishedBase: publishedFolder(null), active: 'sixty' })
    const again = runGenerator({ publishedBase: first.out, mode: 'refresh' })
    assert.equal(again.outputs.changed, 'true')
  })

  test('summary に名前を出さない(件数とデータセット名だけ)', () => {
    const { outputs } = runGenerator({ publishedBase: publishedFolder(null), active: 'sixty' })
    assert.match(outputs.summary, /^files=\d+ events=\d+ pages=\d+ parts=\d+ activeDataset=sixty$/)
  })
})
