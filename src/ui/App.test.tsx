// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../core'
import { AppController } from '../app/controller'
import { AppProvider } from '../app/AppContext'
import { App } from './App'

afterEach(cleanup)

function setup() {
  const controller = new AppController(new MemoryStore(), () => new Date(2026, 10, 1))
  render(
    <AppProvider controller={controller}>
      <App />
    </AppProvider>,
  )
  return controller
}

describe('app flows', () => {
  it('shows Home with the Daily Puzzle and no Continue button initially', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Sudoku' })).toBeTruthy()
    expect(screen.getByLabelText('Daily Puzzle')).toBeTruthy()
    expect(screen.queryByText(/^Continue —/)).toBeNull()
  })

  it('starts a game from the picker and offers Continue after going Home', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New Game' }))
    await user.click(screen.getByRole('button', { name: /Easy/ }))
    expect(screen.getByRole('group', { name: 'Sudoku board' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Row \d, column \d/ })).toHaveLength(81)
    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByText(/^Continue —/)).toBeTruthy()
  })

  it('pauses and hides the board', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New Game' }))
    await user.click(screen.getByRole('button', { name: /Easy/ }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.queryByRole('group', { name: 'Sudoku board' })).toBeNull()
    expect(screen.getByText('Paused')).toBeTruthy()
  })
})

describe('win screen', () => {
  it('New Game from the win screen opens a usable picker and starts a Game', async () => {
    const user = userEvent.setup()
    const controller = setup()
    await user.click(screen.getByRole('button', { name: 'New Game' }))
    await user.click(screen.getByRole('button', { name: /Easy/ }))
    const session = controller.getSnapshot().session!
    // Fill the board with the solution to win.
    for (let p = 0; p < 81; p++) {
      if (!session.state.board[p].given) {
        session.select(p)
        session.tapNumber(session.state.solution[p].value)
      }
    }
    controller.changed()
    await user.click(await screen.findByRole('button', { name: /New Game/ }))
    expect(screen.queryByText(/You won|Solved/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Medium/ }))
    expect(controller.getSnapshot().session?.state.status).toBe('playing')
    expect(controller.getSnapshot().session).not.toBe(session)
  })
})

describe('sharing a win', () => {
  it('copies the result where there is no share sheet', async () => {
    const user = userEvent.setup()
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => void copied.push(t) },
    })
    try {
      const controller = setup()
      await user.click(screen.getByRole('button', { name: 'New Game' }))
      await user.click(screen.getByRole('button', { name: /Easy/ }))
      const session = controller.getSnapshot().session!
      for (let p = 0; p < 81; p++) {
        if (!session.state.board[p].given) {
          session.select(p)
          session.tapNumber(session.state.solution[p].value)
        }
      }
      controller.changed()
      await user.click(await screen.findByRole('button', { name: 'Share' }))
      expect(copied).toHaveLength(1)
      expect(copied[0]).toMatch(/^Sudoku · Easy\n⏱ \d+:\d\d · 0 mistakes\n/)
      expect(await screen.findByText('Copied to the clipboard.')).toBeTruthy()
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})

describe('midnight', () => {
  it('opening the Daily Puzzle after midnight uses the real date, so yesterday is a Catch-Up', () => {
    let now = new Date(2026, 10, 1, 23, 50)
    const c = new AppController(new MemoryStore(), () => now)
    const yesterday = c.getSnapshot().today
    now = new Date(2026, 10, 2, 0, 10)
    c.openDaily(yesterday)
    expect(c.getSnapshot().today).toBe(yesterday + 1)
    expect(c.profile.dailyLog.firstOpened[yesterday]).toBe(yesterday + 1)
  })
})

describe('openToday', () => {
  it('opens the real current day even if the rendered day is stale', () => {
    let now = new Date(2026, 10, 1, 23, 59, 59)
    const c = new AppController(new MemoryStore(), () => now)
    const stale = c.getSnapshot().today
    now = new Date(2026, 10, 2, 0, 0, 0, 500)
    c.openToday()
    expect(c.getSnapshot().today).toBe(stale + 1)
    expect(c.profile.dailyLog.firstOpened[stale + 1]).toBe(stale + 1)
    expect(c.profile.dailyLog.firstOpened[stale]).toBeUndefined()
  })
})
