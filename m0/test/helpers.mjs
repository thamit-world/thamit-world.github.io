import { readFileSync } from 'node:fs'

export const fixedNow = new Date('2026-10-20T03:15:00Z') // JST 12:15
export const seed = 20260925
export const qrFixturesPath = new URL('../qr-fixtures.json', import.meta.url)
export const qrFixtures = JSON.parse(readFileSync(qrFixturesPath, 'utf8')).fixtures
export const generatorPath = new URL('../generate-synthetic-calendar.mjs', import.meta.url)
