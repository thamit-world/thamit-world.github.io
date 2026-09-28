// サイト全体(site/ に書くファイル)の組み立てと siteHash(§5.3・§5.6)。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { datasetByName, datasets, partFileName, renderDataset } from './datasets.mjs'
import { isoSeconds } from './dates.mjs'
import { solidPng } from './png.mjs'

const staticDirectory = new URL('../../static/', import.meta.url)

const qrPage = (name) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>thamit M0 QR ${name}</title>
</head>
<body>
<p>thamit のワールドの M0 試験用の QR です(合成データ)。</p>
</body>
</html>
`

// ファイルの Map<path, Buffer> と、データセットごとの統計を返す。manifest.json は含まない
export const renderSite = ({ now, seed, revision, activeDataset, qrFixtures, volatile = false }) => {
  const files = new Map()
  const stats = new Map()
  files.set('robots.txt', readFileSync(new URL('robots.txt', staticDirectory)))
  files.set('index.html', readFileSync(new URL('index.html', staticDirectory)))

  for (const dataset of datasets) {
    const rendered = renderDataset({ dataset, now, seed, revision, qrFixtures, volatile })
    stats.set(dataset.name, rendered.stats)
    for (const { fileName, bytes } of rendered.files) files.set(`m0/${dataset.name}/${fileName}`, bytes)
  }

  // /v1/events/ は選んだデータセットのコピー(本番と同じパス)。4本ちょうど
  if (!datasetByName(activeDataset)) throw new Error(`知らないデータセット: ${activeDataset}`)
  for (let partIndex = 0; partIndex < 4; partIndex += 1) {
    const source = files.get(`m0/${activeDataset}/${partFileName(partIndex)}`)
    if (!source) throw new Error(`${activeDataset} には ${partFileName(partIndex)} がないので /v1/events/ に置けない`)
    files.set(`v1/events/${partFileName(partIndex)}`, source)
  }

  files.set('m0/image/probe-256.png', solidPng({ width: 256, height: 256, red: 0x33, green: 0x99, blue: 0xcc }))
  for (const fixture of qrFixtures) files.set(`m0/qr/${fixture.name}.html`, Buffer.from(qrPage(fixture.name), 'utf8'))
  return { files, stats }
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// generatedAt・expiresAtUnixSeconds・revision を固定して作ったサイトの中身のハッシュ。
// 先頭に activeDataset の行、続けてパスの順に「パス<TAB>ハッシュ」を並べた文字列の SHA-256
export const siteHashOfFiles = (files, activeDataset) => {
  const lines = [`activeDataset\t${activeDataset}`]
  for (const path of [...files.keys()].sort()) {
    if (path !== 'm0/manifest.json') lines.push(`${path}\t${sha256(files.get(path))}`)
  }
  return sha256(lines.join('\n'))
}

export const siteHashOf = ({ now, seed, activeDataset, qrFixtures }) =>
  siteHashOfFiles(renderSite({ now, seed, revision: 0, activeDataset, qrFixtures, volatile: true }).files, activeDataset)

export const manifestFor = ({ activeDataset, siteHash, now }) =>
  Buffer.from(`${JSON.stringify({ activeDataset, siteHash, generatedAt: isoSeconds(now) })}\n`, 'utf8')
