// M0 の合成データのジェネレーター(手順書 §5)。Node 22 標準だけで動く(依存ゼロ)。
//
//   node m0/generate-synthetic-calendar.mjs
//     --out <dir>             出力先(既定 site)
//     --active <dataset>|keep /v1/events/ に置くデータセット(既定 keep。公開中の
//                             /m0/manifest.json の activeDataset を引き継ぐ。読めなければ sixty)
//     --now <ISO 8601>        基準時刻(既定は現在時刻)
//     --seed <整数>           乱数の種(既定 20260925)
//     --revision <整数>       既定は GITHUB_RUN_NUMBER*10+GITHUB_RUN_ATTEMPT、なければ 1
//     --mode build|refresh    build は公開中の siteHash と同じなら changed=false。refresh は常に true
//     --published-base <url>  比べる相手(既定 https://thamit-world.github.io。ローカルのフォルダも可)
//     --check-url <url>       公開中の calendar.json(とパート1〜3)を取って、形の検証だけをする
//     --qr-fixtures <path>    QR の行列(既定 m0/qr-fixtures.json)
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { maximumPartCount } from './lib/calendar.mjs'
import { activeDatasetNames, datasets, partFileName } from './lib/datasets.mjs'
import { manifestFor, renderSite, siteHashOf } from './lib/site.mjs'
import { verifyParts, verifySite } from './lib/verify.mjs'

const defaultOrg = 'thamit-world'

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'site' },
    active: { type: 'string', default: 'keep' },
    now: { type: 'string' },
    seed: { type: 'string', default: '20260925' },
    revision: { type: 'string' },
    mode: { type: 'string', default: 'refresh' },
    'published-base': { type: 'string', default: `https://${defaultOrg}.github.io` },
    'check-url': { type: 'string' },
    'qr-fixtures': { type: 'string', default: fileURLToPath(new URL('./qr-fixtures.json', import.meta.url)) },
  },
})

const fail = (message) => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const isUrl = (base) => /^https?:\/\//.test(base)

// 公開中のファイル(またはローカルのフォルダ)を読む。404・読めないときは null
const readPublished = async (base, path) => {
  if (!isUrl(base)) {
    const file = join(base, path)
    return existsSync(file) ? readFileSync(file) : null
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/${path}`, { headers: { 'cache-control': 'no-cache' } })
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

const checkUrl = async (url) => {
  const directory = url.slice(0, url.lastIndexOf('/') + 1)
  const bodies = []
  for (let partIndex = 0; partIndex < maximumPartCount; partIndex += 1) {
    const response = await fetch(`${directory}${partFileName(partIndex)}`, { headers: { 'cache-control': 'no-cache' } })
    bodies.push(response.ok ? Buffer.from(await response.arrayBuffer()) : null)
    console.log(`${response.status}\t${bodies.at(-1)?.length ?? '-'} bytes\t${directory}${partFileName(partIndex)}`)
  }
  const errors = verifyParts(bodies, {}, directory)
  if (errors.length > 0) fail(`検証に落ちた:\n${errors.join('\n')}`)
  console.log('ok: 形の検証がすべて通った')
}

const main = async () => {
  if (values['check-url']) return checkUrl(values['check-url'])

  if (!['build', 'refresh'].includes(values.mode)) fail(`--mode は build か refresh: ${values.mode}`)
  const seed = Number.parseInt(values.seed, 10)
  if (!Number.isInteger(seed)) fail(`--seed が整数でない: ${values.seed}`)
  const now = values.now ? new Date(values.now) : new Date()
  if (Number.isNaN(now.getTime())) fail(`--now が読めない: ${values.now}`)
  const environmentRevision = Number(process.env.GITHUB_RUN_NUMBER) * 10 + Number(process.env.GITHUB_RUN_ATTEMPT)
  const revision = values.revision ? Number.parseInt(values.revision, 10) : Number.isInteger(environmentRevision) && environmentRevision > 0 ? environmentRevision : 1

  const qrFixtures = JSON.parse(readFileSync(values['qr-fixtures'], 'utf8')).fixtures

  const needsPublished = values.active === 'keep' || values.mode === 'build'
  const publishedManifestBody = needsPublished ? await readPublished(values['published-base'], 'm0/manifest.json') : null
  let publishedManifest = null
  try {
    publishedManifest = publishedManifestBody ? JSON.parse(publishedManifestBody.toString('utf8')) : null
  } catch {
    publishedManifest = null
  }

  const activeDataset =
    values.active === 'keep'
      ? activeDatasetNames.includes(publishedManifest?.activeDataset)
        ? publishedManifest.activeDataset
        : 'sixty'
      : values.active
  if (!activeDatasetNames.includes(activeDataset)) fail(`/v1/events/ に置けるのは ${activeDatasetNames.join(' / ')} だけ: ${activeDataset}`)

  const { files, stats } = renderSite({ now, seed, revision, activeDataset, qrFixtures })
  const errors = verifySite(files, { datasets })
  if (errors.length > 0) fail(`検証に落ちた:\n${errors.join('\n')}`)

  const siteHash = siteHashOf({ now, seed, activeDataset, qrFixtures })
  const changed = values.mode === 'refresh' || publishedManifest?.siteHash !== siteHash

  // 出力先:前回の出力(m0/manifest.json がある)なら消して作り直す。ほかのものが入っていたら止める
  const out = resolve(values.out)
  if (existsSync(out) && readdirSync(out).length > 0) {
    if (!existsSync(join(out, 'm0', 'manifest.json'))) fail(`${out} は空でなく、前回の出力でもない`)
    rmSync(out, { recursive: true, force: true })
  }
  files.set('m0/manifest.json', manifestFor({ activeDataset, siteHash, now }))
  for (const [path, body] of files) {
    const target = join(out, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }

  const active = stats.get(activeDataset)
  const summary = `files=${files.size} events=${active.eventCount} pages=${active.pageCount} parts=${active.partCount} activeDataset=${activeDataset}`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nsummary=${summary}\n`, 'utf8')

  console.log(['dataset', 'part', 'bytes', 'events', 'pages', 'parts', 'omitted', 'contentHash'].join('\t'))
  for (const dataset of datasets) {
    const stat = stats.get(dataset.name)
    for (let partIndex = 0; partIndex < maximumPartCount; partIndex += 1) {
      const body = files.get(`m0/${dataset.name}/${partFileName(partIndex)}`)
      if (!body) continue
      console.log([dataset.name, partIndex, body.length, stat.eventCount, stat.pageCount, stat.partCount, stat.omittedEventCount, stat.contentHash].join('\t'))
    }
  }
  console.log(`siteHash=${siteHash}`)
  console.log(`changed=${changed} ${summary} revision=${revision}`)
}

await main()
