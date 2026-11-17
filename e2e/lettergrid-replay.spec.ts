import { expect, test, type Page } from '@playwright/test'
import { addDays, longTitle, shortTitle } from '../src/core'
import { NOW, TODAY, expectedShareLines, makePlays, playOpenDaily, scriptFor, swapScript } from './lettergrid'

// Replay (ADR 0004): a solved Lettergrid Daily can be played again, its best-scoring solve counts, and a
// Replay never touches the Calendar kind or the Streak.

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
})

const dailyCard = (page: Page) => page.getByRole('region', { name: 'Lettergrid Daily Puzzle' })
const finishDialog = (page: Page) => page.getByRole('dialog', { name: 'Daily Puzzle Solved!' })

async function expectStatistics(page: Page, s: { played: number; best: number; par: [number, number, number] }) {
  await page.getByRole('button', { name: 'Statistics' }).click()
  const stats = page.getByRole('region', { name: 'Daily Puzzles' })
  await expect(stats.locator('.stat-row', { hasText: /^Dailies played/ })).toContainText(String(s.played))
  await expect(stats.locator('.stat-row', { hasText: /^Best score/ })).toContainText(String(s.best))
  await expect(stats.locator('.stat-row', { hasText: /^1 star Par reached/ })).toContainText(String(s.par[0]))
  await expect(stats.locator('.stat-row', { hasText: /^2 stars Par reached/ })).toContainText(String(s.par[1]))
  await expect(stats.locator('.stat-row', { hasText: /^3 stars Par reached/ })).toContainText(String(s.par[2]))
  await page.keyboard.press('Escape')
}

test('a lower Replay of today leaves the best score, stars, Streak and Statistics alone', async ({ page }) => {
  const daily = dailyCard(page)
  const best = scriptFor(TODAY)
  expect(best.score).toBeGreaterThan(0)

  await daily.getByRole('button', { name: 'Play', exact: true }).click()
  await playOpenDaily(page, best)
  await finishDialog(page).getByRole('button', { name: 'Home' }).click()

  // Replay from Home and score nothing.
  await daily.getByRole('button', { name: 'Play again' }).click()
  await playOpenDaily(page, swapScript())
  const finish = finishDialog(page)
  await expect(finish.getByText('Score 0', { exact: true })).toBeVisible()
  await expect(finish.getByLabel('No stars')).toBeVisible()
  await expect(finish.getByText(`Best ${best.score}`, { exact: true })).toBeVisible()
  await expect(finish.getByText('New best!')).toHaveCount(0)

  // Share carries the day's best solve, not this Replay.
  await finish.getByRole('button', { name: 'Share' }).click()
  await expect(finish.getByText('Copied to the clipboard.')).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.split('\n').slice(0, 2)).toEqual(expectedShareLines(best, shortTitle(TODAY)))

  await finish.getByRole('button', { name: 'Home' }).click()
  await expect(daily.getByText(`Score ${best.score}`)).toBeVisible()
  await expect(daily.getByLabel('3 stars')).toBeVisible()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()
  await expect(daily.getByRole('button', { name: 'Play again' })).toBeEnabled()
  await expectStatistics(page, { played: 1, best: best.score, par: [1, 1, 1] })
})

test('a higher Replay started from the finish dialog becomes the day\'s result', async ({ page }) => {
  const daily = dailyCard(page)
  const best = scriptFor(TODAY)

  // A first solve that scores nothing still solves the day.
  await daily.getByRole('button', { name: 'Play', exact: true }).click()
  await playOpenDaily(page, swapScript())
  const first = finishDialog(page)
  await expect(first.getByText('Score 0', { exact: true })).toBeVisible()
  await expect(first.getByText('New best!')).toHaveCount(0) // nothing to beat yet

  // Play again straight from the dialog deals the same day afresh.
  await first.getByRole('button', { name: 'Play again' }).click()
  await expect(finishDialog(page)).toHaveCount(0)
  await playOpenDaily(page, best)
  const finish = finishDialog(page)
  await expect(finish.getByText(`Score ${best.score}`, { exact: true })).toBeVisible()
  await expect(finish.getByText('New best!')).toBeVisible()
  await expect(finish.getByText(/^Best \d+$/)).toHaveCount(0)

  await finish.getByRole('button', { name: 'Home' }).click()
  await expect(daily.getByText(`Score ${best.score}`)).toBeVisible()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()
  // Still one Daily played, now judged by its best solve.
  await expectStatistics(page, { played: 1, best: best.score, par: [1, 1, 1] })
})

test('a past day replayed from the Calendar stays a Catch-Up Solve and leaves the Streak alone', async ({ page }) => {
  const daily = dailyCard(page)
  const past = addDays(TODAY, -1)
  const best = scriptFor(past)

  // Solve today (Streak 1), then catch up yesterday with nothing scored.
  await daily.getByRole('button', { name: 'Play', exact: true }).click()
  await playOpenDaily(page, scriptFor(TODAY))
  await finishDialog(page).getByRole('button', { name: 'Home' }).click()
  await daily.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: `${longTitle(past)}, not solved`, exact: true }).click()
  await playOpenDaily(page, swapScript())
  await finishDialog(page).getByRole('button', { name: 'Home' }).click()

  // Replay yesterday from its Calendar result.
  await daily.getByRole('button', { name: 'Calendar' }).click()
  const sheet = page.getByRole('dialog', { name: 'Lettergrid Calendar' })
  await sheet.getByRole('button', { name: new RegExp(`^${longTitle(past)}, solved later`) }).click()
  const result = page.getByRole('region', { name: 'Daily Puzzle result' })
  await expect(result.getByText('Score 0 ·')).toBeVisible()
  await result.getByRole('button', { name: 'Play again' }).click()
  await playOpenDaily(page, best)
  await expect(finishDialog(page).getByText('New best!')).toBeVisible()
  await finishDialog(page).getByRole('button', { name: 'Home' }).click()

  // The Calendar shows the better score, still solved later; the Streak is still 1.
  await expect(daily.getByText('Streak 1 day')).toBeAttached()
  await daily.getByRole('button', { name: 'Calendar' }).click()
  await sheet.getByRole('button', { name: new RegExp(`^${longTitle(past)}, solved later`) }).click()
  await expect(result.getByText('Solved later')).toBeVisible()
  await expect(result.getByText(`Score ${best.score} ·`)).toBeVisible()
  await expect(sheet.getByText('Streak', { exact: true }).locator('..')).toContainText('1')
  await page.keyboard.press('Escape')
  await expectStatistics(page, { played: 2, best: Math.max(best.score, scriptFor(TODAY).score), par: [2, 2, 2] })
})

test('a Replay left part-way is offered as Continue, survives a reload, and resumes where it was', async ({ page }) => {
  const daily = dailyCard(page)
  await daily.getByRole('button', { name: 'Play', exact: true }).click()
  await playOpenDaily(page, scriptFor(TODAY))
  await finishDialog(page).getByRole('button', { name: 'Home' }).click()

  // Start a Replay, make one Play, and leave.
  await daily.getByRole('button', { name: 'Play again' }).click()
  const opening = scriptFor(TODAY).plays[0]
  expect(opening.kind).toBe('play')
  await makePlays(page, [opening])
  await expect(page.getByText('5 of 6 Plays remaining')).toBeAttached()
  await page.getByRole('button', { name: 'Home', exact: true }).click()

  await expect(daily.getByRole('button', { name: 'Continue' })).toBeEnabled()
  await page.reload()
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
  await expect(daily.getByRole('button', { name: 'Continue' })).toBeEnabled()

  // The Calendar offers the same Replay for today.
  await daily.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: new RegExp(`^${longTitle(TODAY)}, solved`) }).click()
  await expect(page.getByRole('region', { name: 'Daily Puzzle result' }).getByRole('button', { name: 'Continue' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Resuming keeps the Play already made: its tiles are still on the board.
  await daily.getByRole('button', { name: 'Continue' }).click()
  const board = page.getByRole('group', { name: 'Lettergrid board' })
  for (const t of opening.tiles) {
    await expect(board.locator(`[data-p="${t.row * 9 + t.col}"]`)).toHaveAccessibleName(new RegExp(`${t.letter.toUpperCase()}, \\d+ points?, played$`))
  }
})
