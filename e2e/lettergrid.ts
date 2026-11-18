import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { dayFromDate, type CalendarDay } from '../src/core'
import {
  lettergridDaily,
  newGame,
  parseWordList,
  solveGreedy,
  starsFor,
  type PlayRecord,
  type WordList,
} from '../src/core/lettergrid'
import { PLAYS_PER_DAILY } from '../src/core/lettergrid/grid'

/** The fixed local "now" of the Lettergrid specs: mid-month, so the Calendar has past days to catch up on. */
export const NOW = new Date(2026, 5, 15, 12, 0, 0)
export const TODAY: CalendarDay = dayFromDate(NOW)

let words: WordList | null = null
function wordList(): WordList {
  words ??= parseWordList(readFileSync(new URL('../public/lettergrid/wordlist-v1.txt', import.meta.url), 'utf8'))
  return words
}

export interface DailyScript {
  plays: PlayRecord[]
  score: number
  stars: number
}

/**
 * The Plays of the deterministic greedy solver for `day`: the same ones that set the day's Par, so they
 * are legal by construction and never depend on luck.
 */
export function scriptFor(day: CalendarDay): DailyScript {
  const daily = lettergridDaily(day, wordList())
  const solved = solveGreedy(newGame(daily), wordList())
  return { plays: solved.plays, score: solved.score, stars: starsFor(solved.score, daily.par) }
}

/** Spends every Play on a Swap: a legal finish on any day that scores nothing and reaches no Par. */
export const swapScript = (): DailyScript => ({
  plays: Array.from({ length: PLAYS_PER_DAILY }, (): PlayRecord => ({ kind: 'swap', score: 0, tiles: [] })),
  score: 0,
  stars: 0,
})

/** Plays the open Lettergrid Daily the way a player would: tap a square, tap a Rack tile, Submit Play. */
export async function playOpenDaily(page: Page, script: DailyScript): Promise<void> {
  await makePlays(page, script.plays)
  await expect(page.getByRole('dialog', { name: 'Daily Puzzle Solved!' })).toBeVisible()
}

/** Makes Plays in the open Lettergrid Daily without expecting it to finish. */
export async function makePlays(page: Page, plays: readonly PlayRecord[]): Promise<void> {
  const board = page.getByRole('group', { name: 'Lettergrid board' })
  await expect(board).toBeVisible()
  for (const play of plays) {
    if (play.kind === 'swap') {
      await page.getByRole('button', { name: 'Swap', exact: true }).click()
      await page.getByRole('alertdialog', { name: 'Swap your Rack?' }).getByRole('button', { name: 'Swap', exact: true }).click()
      continue
    }
    for (const t of play.tiles) {
      await board.locator(`[data-p="${t.row * 9 + t.col}"]`).click()
      await page
        .getByRole('group', { name: 'Rack' })
        .getByRole('button', { name: new RegExp(`^Rack tile ${t.letter.toUpperCase()}, \\d+ points?$`) })
        .first()
        .click()
    }
    await page.getByRole('button', { name: 'Submit Play' }).click()
  }
}

/** The text a Lettergrid result is shared as, without the closing URL line. */
export function expectedShareLines(script: DailyScript, shortTitle: string): string[] {
  const stars = '★'.repeat(script.stars)
  const line = `${script.plays.map((p) => (p.kind === 'swap' ? '↺' : String(p.score))).join(' · ')} = ${script.score}${stars ? ` ${stars}` : ''}`
  return [`Lettergrid · Daily Puzzle ${shortTitle}`, line]
}

/** The squares the Seed Word sits on for `day`. */
export function seedCellsFor(day: CalendarDay): number[] {
  return newGame(lettergridDaily(day, wordList())).seedCells
}

async function centre(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox()
  if (!box) throw new Error('drag target is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Drags from the centre of `from` to the centre of `to` in small steps, with a mouse or a finger. Touch
 * goes through the Chrome DevTools Protocol, since Playwright's touchscreen can only tap.
 */
export async function dragTile(page: Page, from: Locator, to: Locator, input: 'mouse' | 'touch' = 'mouse'): Promise<void> {
  const a = await centre(from)
  const b = await centre(to)
  const steps = 8
  const at = (i: number) => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps })
  if (input === 'mouse') {
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps })
    await page.mouse.up()
    return
  }
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] })
  await touch('touchStart', a)
  for (let i = 1; i <= steps; i++) await touch('touchMove', at(i))
  await touch('touchEnd')
  await cdp.detach()
}
