import { expect, test } from '@playwright/test'
import { solveOpenGame, startGame, winEasyGame, wonCount } from './app'

test('winning a Game shows the win screen and counts in Statistics', async ({ page }) => {
  await page.goto('/')
  expect(await wonCount(page)).toBe('0')
  await winEasyGame(page)
  const win = page.getByRole('dialog', { name: 'Puzzle Solved!' })
  await expect(win.getByText('Easy', { exact: true })).toBeVisible()
  await expect(win.getByText(/Mistakes 0 · Hints used 0/)).toBeVisible()
  await win.getByRole('button', { name: 'Home' }).click()
  expect(await wonCount(page)).toBe('1')
})

test('a Game in progress survives a reload and offers Continue', async ({ page }) => {
  await page.goto('/')
  await startGame(page, 'Medium')
  await page.getByRole('button', { name: /, empty$/ }).first().click()
  await page.keyboard.press('5')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: /^Continue Medium game/ }).click()
  await expect(page.getByRole('button', { name: /, 5, (entered|wrong)$/ })).toHaveCount(1)
})

test('solving the Daily Puzzle marks it Solved and starts a Streak', async ({ page }) => {
  await page.goto('/')
  const daily = page.getByRole('region', { name: 'Daily Puzzle' })
  await daily.getByRole('button', { name: /Play/ }).click()
  await solveOpenGame(page)
  await page.getByRole('dialog', { name: 'Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()
  await expect(daily.getByRole('button', { name: /Solved/ })).toBeDisabled()
  await expect(daily.getByText('Streak 1 day')).toBeAttached()

  // The result stays available in the Calendar after the win screen is gone.
  await daily.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: /, solved on the day$/ }).click()
  const result = page.getByRole('region', { name: 'Daily Puzzle result' })
  await expect(result.getByText(/Mistakes 0 · Hints used 0/)).toBeVisible()
  await expect(result.getByRole('button', { name: 'Share' })).toBeVisible()
})
