import { expect, test, type Page } from '@playwright/test'
import { GRID_SIZE } from '../src/core/lettergrid'
import { NOW, TODAY, dragTile, scriptFor, seedCellsFor } from './lettergrid'

// Rack tiles can be dragged onto the board as well as placed with two taps. A tile placed this Play can be
// dragged to another square, or off the board to take it back; seed and played tiles never move.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await page.getByRole('tab', { name: /^Lettergrid/ }).click()
  await page.getByRole('region', { name: 'Lettergrid Daily Puzzle' }).getByRole('button', { name: /Play/ }).click()
  await expect(board(page)).toBeVisible()
})

const board = (page: Page) => page.getByRole('group', { name: 'Lettergrid board' })
const square = (page: Page, cell: number) => board(page).locator(`[data-p="${cell}"]`)
const rack = (page: Page) => page.getByRole('group', { name: 'Rack' })
const L = (letter: string) => letter.toUpperCase()
/** A Rack tile with `letter` that is still in the Rack. */
const rackTile = (page: Page, letter: string) =>
  rack(page).getByRole('button', { name: new RegExp(`^Rack tile ${L(letter)}, \\d+ points?$`) }).first()
const placedLabel = (letter: string) => new RegExp(`, ${L(letter)}, \\d+ points?, placed this Play`)
const emptyLabel = /, empty/

/** Two empty squares well away from the Seed Word, so the tests never depend on the day's layout. */
function freeSquares(): [number, number] {
  const seed = new Set(seedCellsFor(TODAY))
  const corners = [0, GRID_SIZE - 1, GRID_SIZE * (GRID_SIZE - 1), GRID_SIZE * GRID_SIZE - 1].filter((c) => !seed.has(c))
  return [corners[0], corners[1]]
}

/** The first placing Play of today's scripted solve: legal by construction. */
function firstPlay() {
  const play = scriptFor(TODAY).plays.find((p) => p.kind !== 'swap')
  if (!play) throw new Error('the script has no placing Play')
  return play
}

test('Rack tiles dragged onto the board make a Play that scores', async ({ page }) => {
  const play = firstPlay()
  for (const t of play.tiles) {
    const cell = square(page, t.row * GRID_SIZE + t.col)
    await dragTile(page, rackTile(page, t.letter), cell)
    await expect(cell).toHaveAccessibleName(placedLabel(t.letter))
  }
  await page.getByRole('button', { name: 'Submit Play' }).click()
  await expect(page.getByText(`Play scored ${play.score}.`)).toBeVisible()
})

test('a placed tile can be moved, replaced, or dragged off the board back to the Rack', async ({ page }) => {
  const [a, b] = freeSquares()
  const letters = firstPlay().tiles.map((t) => t.letter)
  const [first, second] = [letters[0], letters.find((l) => l !== letters[0]) ?? letters[1]]

  // Rack → square.
  await dragTile(page, rackTile(page, first), square(page, a))
  await expect(square(page, a)).toHaveAccessibleName(placedLabel(first))
  await expect(rack(page).getByRole('button', { name: `Rack tile ${L(first)}, on the grid, tap to take back` })).toHaveCount(1)

  // Square → square: the tile moves, and its old square is empty again.
  await dragTile(page, square(page, a), square(page, b))
  await expect(square(page, b)).toHaveAccessibleName(placedLabel(first))
  await expect(square(page, a)).toHaveAccessibleName(emptyLabel)

  // Onto a tile placed this Play: the new tile takes the square and the old one goes back to the Rack.
  await dragTile(page, rackTile(page, second), square(page, b))
  await expect(square(page, b)).toHaveAccessibleName(placedLabel(second))
  await expect(rack(page).getByRole('button', { name: /on the grid/ })).toHaveCount(1)

  // Off the board: back to the Rack.
  await dragTile(page, square(page, b), page.locator('.lg-scoreboard'))
  await expect(square(page, b)).toHaveAccessibleName(emptyLabel)
  await expect(rack(page).getByRole('button', { name: /on the grid/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit Play' })).toBeDisabled()
})

test('a Rack tile dropped on the Seed Word or off the board goes home', async ({ page }) => {
  const seedCell = seedCellsFor(TODAY)[0]
  const letter = firstPlay().tiles[0].letter
  const seedName = await square(page, seedCell).getAttribute('aria-label')

  await dragTile(page, rackTile(page, letter), square(page, seedCell))
  await expect(square(page, seedCell)).toHaveAttribute('aria-label', seedName ?? '')
  await dragTile(page, rackTile(page, letter), page.locator('.lg-scoreboard'))
  await expect(rack(page).getByRole('button', { name: /on the grid/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit Play' })).toBeDisabled()
})

test('a short press is still a tap: two taps place a tile and nothing is dragged', async ({ page }) => {
  const [a] = freeSquares()
  const letter = firstPlay().tiles[0].letter
  await rackTile(page, letter).click()
  await square(page, a).click()
  await expect(square(page, a)).toHaveAccessibleName(placedLabel(letter))
  // Tapping the placed tile still takes it back.
  await square(page, a).click()
  await expect(square(page, a)).toHaveAccessibleName(emptyLabel)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  test('a finger drags a Rack tile onto the board and a placed tile off it', async ({ page }) => {
    const [a, b] = freeSquares()
    const letter = firstPlay().tiles[0].letter
    await dragTile(page, rackTile(page, letter), square(page, a), 'touch')
    await expect(square(page, a)).toHaveAccessibleName(placedLabel(letter))
    await dragTile(page, square(page, a), square(page, b), 'touch')
    await expect(square(page, b)).toHaveAccessibleName(placedLabel(letter))
    await expect(square(page, a)).toHaveAccessibleName(emptyLabel)
    await dragTile(page, square(page, b), page.locator('.lg-scoreboard'), 'touch')
    await expect(square(page, b)).toHaveAccessibleName(emptyLabel)
  })
})
