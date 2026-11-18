import { expect, test, type Page } from '@playwright/test'
import { NOW, dragTile, playOpenDaily, swapScript } from './lettergrid'

// The Feature Intro for dragging tiles: shown on the board until the player places a tile (any way) or
// dismisses it, then never again. Account sync of the finished mark is covered by the sync doc's unit tests.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
})

const dailyCard = (page: Page) => page.getByRole('region', { name: 'Lettergrid Daily Puzzle' })
const board = (page: Page) => page.getByRole('group', { name: 'Lettergrid board' })
const intro = (page: Page) => page.getByRole('note').filter({ hasText: 'Drag tiles onto the board' })
const ghost = (page: Page) => page.locator('.lg-intro-ghost')
const firstRackTile = (page: Page) => page.getByRole('group', { name: 'Rack' }).getByRole('button', { name: /^Rack tile / }).first()
const emptySquare = (page: Page) => board(page).getByRole('button', { name: /, empty/ }).first()

async function play(page: Page) {
  await dailyCard(page).getByRole('button', { name: /Play/ }).click()
  await expect(board(page)).toBeVisible()
}

async function reopen(page: Page) {
  await page.reload()
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
  await dailyCard(page).getByRole('button', { name: /Play|Continue/ }).click()
  await expect(board(page)).toBeVisible()
}

test('the intro shows with a gliding tile, and the first drag finishes it for good', async ({ page }) => {
  await play(page)
  await expect(intro(page)).toBeVisible()
  await expect(ghost(page)).toBeAttached()

  await dragTile(page, firstRackTile(page), emptySquare(page))
  await expect(intro(page)).toHaveCount(0)
  await expect(ghost(page)).toHaveCount(0)

  await reopen(page)
  await expect(intro(page)).toHaveCount(0)
})

test('placing a tile with two taps also finishes it', async ({ page }) => {
  await play(page)
  await expect(intro(page)).toBeVisible()
  await emptySquare(page).click()
  await firstRackTile(page).click()
  await expect(intro(page)).toHaveCount(0)
})

test('dismissing finishes it; leaving without either shows it again', async ({ page }) => {
  await play(page)
  await expect(intro(page)).toBeVisible()
  await reopen(page)
  await expect(intro(page)).toBeVisible()

  await intro(page).getByRole('button', { name: 'Dismiss tip' }).click()
  await expect(intro(page)).toHaveCount(0)
  await reopen(page)
  await expect(intro(page)).toHaveCount(0)
})

test('a finished board never shows the intro', async ({ page }) => {
  await play(page)
  await playOpenDaily(page, swapScript()) // finishes without placing a tile
  await expect(intro(page)).toHaveCount(0)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('the caption shows without the gliding tile', async ({ page }) => {
    await play(page)
    await expect(intro(page)).toBeVisible()
    await expect(ghost(page)).toHaveCount(0)
  })
})
