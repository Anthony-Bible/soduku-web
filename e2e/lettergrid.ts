import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
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

/** Plays the open Lettergrid Daily the way a player would: tap a square, tap a Rack tile, Submit Play. */
export async function playOpenDaily(page: Page, script: DailyScript): Promise<void> {
  const board = page.getByRole('group', { name: 'Lettergrid board' })
  await expect(board).toBeVisible()
  for (const play of script.plays) {
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
  await expect(page.getByRole('dialog', { name: 'Daily Puzzle Solved!' })).toBeVisible()
}

/** The text a Lettergrid result is shared as, without the closing URL line. */
export function expectedShareLines(script: DailyScript, shortTitle: string): string[] {
  const stars = '★'.repeat(script.stars)
  const line = `${script.plays.map((p) => (p.kind === 'swap' ? '↺' : String(p.score))).join(' · ')} = ${script.score}${stars ? ` ${stars}` : ''}`
  return [`Lettergrid · Daily Puzzle ${shortTitle}`, line]
}
