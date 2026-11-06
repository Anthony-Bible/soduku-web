import { expect, test } from '@playwright/test'
import { addDays, longTitle, shortTitle } from '../src/core'
import { NOW, TODAY, expectedShareLines, playOpenDaily, scriptFor } from './lettergrid'

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.setFixedTime(NOW)
})

test('a Lettergrid Daily is played to the end, shared, and starts a Streak without touching Sudoku', async ({ page }) => {
  await page.goto('/')

  // The app opens on Sudoku, with both games' Dailies unsolved.
  const sudokuTab = page.getByRole('tab', { name: /^Sudoku/ })
  const lettergridTab = page.getByRole('tab', { name: /^Lettergrid/ })
  await expect(sudokuTab).toHaveAttribute('aria-selected', 'true')
  await expect(lettergridTab).toHaveAttribute('aria-selected', 'false')
  await expect(lettergridTab).toContainText("today's Daily Puzzle unsolved")
  await expect(sudokuTab).toContainText("today's Daily Puzzle unsolved")

  await lettergridTab.click()
  const daily = page.getByRole('region', { name: 'Lettergrid Daily Puzzle' })
  await expect(daily.getByText('Streak 0 days')).toBeAttached()
  await daily.getByRole('button', { name: /Play/ }).click()

  const script = scriptFor(TODAY)
  await playOpenDaily(page, script)

  const finish = page.getByRole('dialog', { name: 'Daily Puzzle Solved!' })
  await expect(finish.getByText(`Score ${script.score}`)).toBeVisible()
  // The solver's own line reaches the top Par tier.
  expect(script.stars).toBe(3)
  await expect(finish.getByLabel('3 stars')).toBeVisible()

  // Share goes to the clipboard on desktop, and carries scores only.
  await finish.getByRole('button', { name: 'Share' }).click()
  await expect(finish.getByText('Copied to the clipboard.')).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  const lines = copied.split('\n')
  expect(lines.slice(0, 2)).toEqual(expectedShareLines(script, shortTitle(TODAY)))
  expect(lines).toHaveLength(3) // no streak line for a first solve
  expect(lines[2]).toMatch(/^http:\/\/localhost:\d+$/)

  await finish.getByRole('button', { name: 'Home' }).click()

  // The Lettergrid dot is gone and its Streak is 1; Sudoku is untouched.
  await expect(lettergridTab).not.toContainText("today's Daily Puzzle unsolved")
  await expect(daily.getByRole('button', { name: /Solved/ })).toBeDisabled()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()
  await expect(daily.getByText(`Score ${script.score}`)).toBeVisible()
  await expect(sudokuTab).toContainText("today's Daily Puzzle unsolved")
  await sudokuTab.click()
  await expect(page.getByRole('region', { name: 'Daily Puzzle' }).getByText('Streak 0 days')).toBeAttached()

  // Statistics count the Daily.
  await lettergridTab.click()
  await page.getByRole('button', { name: 'Statistics' }).click()
  const stats = page.getByRole('region', { name: 'Daily Puzzles' })
  await expect(stats.locator('.stat-row', { hasText: /^Dailies played/ })).toContainText('1')
  await expect(stats.locator('.stat-row', { hasText: /^Best score/ })).toContainText(String(script.score))
  // Par tiers are cumulative: a 3-star solve reached all three.
  await expect(stats.locator('.stat-row', { hasText: /^1 star Par reached/ })).toContainText('1')
  await expect(stats.locator('.stat-row', { hasText: /^2 stars Par reached/ })).toContainText('1')
  await expect(stats.locator('.stat-row', { hasText: /^3 stars Par reached/ })).toContainText('1')
  await page.keyboard.press('Escape')

  // A reload goes back to Sudoku, and the solve is still there.
  await page.reload()
  await expect(sudokuTab).toHaveAttribute('aria-selected', 'true')
  await expect(lettergridTab).not.toContainText("today's Daily Puzzle unsolved")
  await lettergridTab.click()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()
  await expect(daily.getByRole('button', { name: /Solved/ })).toBeDisabled()
})

test('a Catch-Up Solve from the Lettergrid Calendar does not extend the Streak', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
  const daily = page.getByRole('region', { name: 'Lettergrid Daily Puzzle' })

  // Solve today first so there is a Streak of 1 to leave alone.
  await daily.getByRole('button', { name: /Play/ }).click()
  await playOpenDaily(page, scriptFor(TODAY))
  await page.getByRole('dialog', { name: 'Daily Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()

  // Catch up yesterday and the day before: neither extends nor repairs the run.
  const sheetName = 'Lettergrid Calendar'
  const streakCell = (sheet: ReturnType<typeof page.getByRole>) => sheet.getByText('Streak', { exact: true }).locator('..')
  for (const offset of [-1, -2]) {
    const past = addDays(TODAY, offset)
    await daily.getByRole('button', { name: 'Calendar' }).click()
    await page.getByRole('button', { name: `${longTitle(past)}, not solved`, exact: true }).click()
    await playOpenDaily(page, scriptFor(past))
    await page.getByRole('dialog', { name: 'Daily Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()
    await expect(daily.getByText('Streak 1 day')).toBeAttached()
  }

  // The Calendar records them as solved later, and the Streak summary is unchanged.
  const past = addDays(TODAY, -1)
  const script = scriptFor(past)
  await daily.getByRole('button', { name: 'Calendar' }).click()
  const sheet = page.getByRole('dialog', { name: sheetName })
  await expect(streakCell(sheet)).toContainText('1')
  await expect(streakCell(sheet)).not.toContainText('3')
  await sheet.getByRole('button', { name: new RegExp(`^${longTitle(past)}, solved later`) }).click()
  const result = page.getByRole('region', { name: 'Daily Puzzle result' })
  await expect(result.getByText('Solved later')).toBeVisible()
  await expect(result.getByText(`Score ${script.score}`)).toBeVisible()
  await page.keyboard.press('Escape')

  // Sudoku is untouched by any of it.
  const sudokuTab = page.getByRole('tab', { name: /^Sudoku/ })
  await expect(sudokuTab).toContainText("today's Daily Puzzle unsolved")
  await sudokuTab.click()
  await expect(page.getByRole('region', { name: 'Daily Puzzle' }).getByText('Streak 0 days')).toBeAttached()
})
