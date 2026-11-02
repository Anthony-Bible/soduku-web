import { expect, test } from '@playwright/test'
import { winEasyGame } from './app'

test('after one visit the app opens offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // The first load isn't controlled yet; once it is, everything comes from the precache.
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sudoku' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Daily Puzzle' })).toBeVisible()
  await context.setOffline(false)
})

test('Chromium gets the install banner after the first win, and Install opens the prompt', async ({ page }) => {
  await page.goto('/')
  // Stand in for the browser offering installation (it only does so for real on a served, engaged site).
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
    ;(window as unknown as { __prompted: number }).__prompted = 0
    e.prompt = () => {
      ;(window as unknown as { __prompted: number }).__prompted++
      return Promise.resolve()
    }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  const banner = page.getByRole('region', { name: 'Install Sudoku' })
  await expect(banner).toHaveCount(0)
  await winEasyGame(page)
  await page.getByRole('dialog', { name: 'Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()
  await banner.getByRole('button', { name: 'Install', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1)
  await expect(banner).toHaveCount(0)
})

test('Share on the win screen sends the result text', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[] }
    w.__shared = []
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { text: string }) => {
        w.__shared.push(data.text)
        return Promise.resolve()
      },
    })
  })
  await page.goto('/')
  await winEasyGame(page)
  await page.getByRole('dialog', { name: 'Puzzle Solved!' }).getByRole('button', { name: 'Share' }).click()
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared)
  expect(shared).toHaveLength(1)
  expect(shared[0]).toMatch(/^Sudoku · Easy\n⏱ \d+:\d\d · 0 mistakes\nhttp:\/\/localhost:18787$/)
})
