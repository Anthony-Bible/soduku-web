// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore, longTitle, type CalendarDay } from '../core'
import { AppController } from '../app/controller'
import { AppProvider } from '../app/AppContext'
import { App } from './App'

let copied: string[]
/** userEvent.setup() installs its own clipboard, so ours goes in after it. */
function user() {
  const u = userEvent.setup()
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void copied.push(t) },
  })
  return u
}
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
})

let now: Date
function setup() {
  now = new Date(2026, 10, 3, 12)
  const controller = new AppController(new MemoryStore(), () => now)
  render(
    <AppProvider controller={controller}>
      <App />
    </AppProvider>,
  )
  return controller
}

/** Solves a day's Daily Puzzle with one mistake on the first empty cell, then goes Home unless told to stay. */
function solveDaily(controller: AppController, day: CalendarDay, stay = false) {
  act(() => {
    controller.openDaily(day)
    const session = controller.getSnapshot().session!
    let mistakeMade = false
    for (let p = 0; p < 81; p++) {
      if (session.state.board[p].given) continue
      session.select(p)
      const right = session.state.solution[p].value
      if (!mistakeMade) {
        session.tapNumber((right % 9) + 1)
        session.erase()
        mistakeMade = true
      }
      session.tapNumber(right)
    }
    if (!stay) controller.goHome()
  })
}

const dayButton = (day: CalendarDay) => screen.getByRole('button', { name: new RegExp(`^${longTitle(day)}, `) })
const panel = () => screen.queryByRole('region', { name: 'Daily Puzzle result' })

describe('a solved day in the Calendar', () => {
  it("shows that day's result and shares it, with the Streak only for today", async () => {
    const u = user()
    const controller = setup()
    const today = controller.getSnapshot().today
    // Yesterday solved on its own day, then today: a 2-day Streak.
    now = new Date(2026, 10, 2, 12)
    solveDaily(controller, today - 1)
    now = new Date(2026, 10, 3, 12)
    solveDaily(controller, today)
    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(panel()).toBeNull()

    await u.click(dayButton(today))
    expect(dayButton(today).getAttribute('aria-pressed')).toBe('true')
    expect(within(panel()!).getByText(/Mistakes 1 · Hints used 0/)).toBeTruthy()
    await u.click(within(panel()!).getByRole('button', { name: 'Share' }))
    expect(copied.at(-1)).toMatch(/^Sudoku · Daily Puzzle Nov 3 · \w+\n⏱ \d+:\d\d · 1 mistake · 🔥 2-day streak\n/)

    await u.click(dayButton(today - 1))
    expect(within(panel()!).getByText(/^Monday, November 2/)).toBeTruthy()
    await u.click(within(panel()!).getByRole('button', { name: 'Share' }))
    expect(copied.at(-1)).toMatch(/^Sudoku · Daily Puzzle Nov 2 · \w+\n⏱ \d+:\d\d · 1 mistake\n/)
    expect(await screen.findByText('Copied to the clipboard.')).toBeTruthy()
  })

  it('still opens an unsolved day, and the result closes when the month changes', async () => {
    const u = user()
    const controller = setup()
    const today = controller.getSnapshot().today
    solveDaily(controller, today)
    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    await u.click(dayButton(today))
    expect(panel()).not.toBeNull()
    await u.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(panel()).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Next month' }))
    await u.click(dayButton(today - 1))
    expect(controller.getSnapshot().session?.dailyDay).toBe(today - 1)
  })
})

describe('the win screen', () => {
  it("leaves today's Streak out when the solve was a past day", async () => {
    const u = user()
    const controller = setup()
    const today = controller.getSnapshot().today
    now = new Date(2026, 10, 2, 12)
    solveDaily(controller, today - 1)
    now = new Date(2026, 10, 3, 12)
    solveDaily(controller, today)
    expect(controller.profile.currentStreak(today)).toBe(2)
    solveDaily(controller, today - 5, true)
    const win = screen.getByRole('dialog', { name: 'Puzzle Solved!' })
    await u.click(within(win).getByRole('button', { name: 'Share' }))
    expect(copied.at(-1)).toMatch(/^Sudoku · Daily Puzzle Oct 29 · \w+\n⏱ \d+:\d\d · 1 mistake\n/)
  })
})
