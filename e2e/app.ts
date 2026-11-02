import { expect, type Page } from '@playwright/test'
import { boardFromValues, solve } from '../src/core'
import { seedSignInCode, signInEmailCount } from './db'

/** Reads the 81 cells from their accessible names ("Row 1, column 2, 7, given" / "..., empty"). */
async function readBoard(page: Page): Promise<number[]> {
  const labels = await page.getByRole('group', { name: 'Sudoku board' }).getByRole('button').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  )
  expect(labels).toHaveLength(81)
  return labels.map((l) => {
    const m = /^Row \d, column \d, (\d), given/.exec(l)
    return m ? Number(m[1]) : 0
  })
}

/** Solves the open Game the way a player would: select each empty cell, type its digit. */
export async function solveOpenGame(page: Page): Promise<void> {
  const givens = await readBoard(page)
  const solved = solve(boardFromValues(givens))
  if (!solved) throw new Error('The board on screen has no solution')
  for (let p = 0; p < 81; p++) {
    if (givens[p] !== 0) continue
    const name = `Row ${Math.floor(p / 9) + 1}, column ${(p % 9) + 1}, empty`
    await page.getByRole('button', { name, exact: true }).click()
    await page.keyboard.press(String(solved[p].value))
  }
  await expect(page.getByRole('dialog', { name: 'Puzzle Solved!' })).toBeVisible()
}

export async function startGame(page: Page, difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' = 'Easy'): Promise<void> {
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.getByRole('button', { name: new RegExp(`^${difficulty}`) }).click()
  await expect(page.getByRole('group', { name: 'Sudoku board' })).toBeVisible()
}

export async function winEasyGame(page: Page): Promise<void> {
  await startGame(page)
  await solveOpenGame(page)
}

/** Statistics → Totals → Won, as shown in the sheet. */
export async function wonCount(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Statistics' }).click()
  const row = page.getByRole('region', { name: 'Totals' }).locator('.stat-row', { hasText: /^Won/ })
  const value = (await row.locator('span').nth(1).textContent()) ?? ''
  await page.keyboard.press('Escape')
  return value
}

/** Signs this page in with a Sign-in Code, as the Installed App would. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: /^Account/ }).click()
  await page.getByLabel('Email').fill(email)
  const before = signInEmailCount(email)
  await page.getByRole('button', { name: 'Send sign-in email' }).click()
  await expect(page.getByText(/a sign-in email is on its way/)).toBeVisible()
  await expect.poll(() => signInEmailCount(email)).toBeGreaterThan(before)
  const code = seedSignInCode(email)
  await page.getByRole('group', { name: 'Sign-in Code' }).getByRole('textbox').first().click()
  await page.keyboard.type(code)
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
}
