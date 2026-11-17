// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore, dayFromDate, type CalendarDay } from '../core'
import { bestPlay, CURRENT_WORD_LIST_VERSION, parseWordList, wordListPath, type WordList } from '../core/lettergrid'
import { AppController } from '../app/controller'
import { AppProvider } from '../app/AppContext'
import { App } from './App'

const words: WordList = parseWordList(
  readFileSync(resolve(__dirname, '../../public', wordListPath(CURRENT_WORD_LIST_VERSION)), 'utf8'),
)

let now: Date
let loader: (version: number) => Promise<WordList>
let copied: string[]

function user() {
  const u = userEvent.setup()
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void copied.push(t) },
  })
  return u
}

function setup(store = new MemoryStore()) {
  const controller = new AppController(store, () => now, null, (v) => loader(v))
  render(
    <AppProvider controller={controller}>
      <App />
    </AppProvider>,
  )
  return controller
}

beforeEach(() => {
  now = new Date(2026, 10, 3, 12)
  loader = async () => words
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
  window.history.replaceState(null, '')
})

const today = () => dayFromDate(now)
const openTab = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('tab', { name: /^Lettergrid/ }))
async function playLettergrid(u: ReturnType<typeof userEvent.setup>) {
  await openTab(u)
  await u.click(screen.getByRole('button', { name: /^(Play|Continue)$/ }))
  return screen.findByRole('group', { name: 'Lettergrid board' })
}
const lettergrid = (c: AppController) => c.getSnapshot().lettergrid!

/** Finishes the open Daily with the best first Play and Swaps after it. */
function finish(c: AppController, { firstPlay = true }: { firstPlay?: boolean } = {}) {
  act(() => {
    const s = lettergrid(c)
    const best = firstPlay ? bestPlay(s.state, words) : null
    if (best) expect(s.submit(best.tiles).ok).toBe(true)
    while (!s.finished) expect(s.swap().ok).toBe(true)
  })
}

describe('Home tabs', () => {
  it('always opens on Sudoku, with an accessible tablist that switches games', async () => {
    const u = user()
    setup()
    const tabs = screen.getByRole('tablist')
    const [sudoku, lg] = within(tabs).getAllByRole('tab')
    expect(sudoku).toHaveAttribute('aria-selected', 'true')
    expect(lg).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', sudoku.id)
    expect(screen.getByLabelText('Daily Puzzle')).toBeTruthy()

    await u.click(lg)
    expect(lg).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Lettergrid Daily Puzzle')).toBeTruthy()
    expect(screen.queryByLabelText('Daily Puzzle')).toBeNull()

    lg.focus()
    await u.keyboard('{ArrowLeft}')
    expect(sudoku).toHaveAttribute('aria-selected', 'true')
    expect(sudoku).toHaveFocus()
  })

  it('opens on Sudoku again in a new app instance, whatever tab was last used', async () => {
    const u = user()
    setup()
    await openTab(u)
    cleanup()
    setup()
    expect(screen.getByRole('tab', { name: /^Sudoku/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('dots each tab while that game\'s Daily for today is unsolved, independently', async () => {
    const u = user()
    const c = setup()
    const dot = (name: RegExp) => within(screen.getByRole('tab', { name })).queryByText(/unsolved/)
    expect(dot(/^Sudoku/)).toBeTruthy()
    expect(dot(/^Lettergrid/)).toBeTruthy()

    await playLettergrid(u)
    finish(c)
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))
    expect(dot(/^Lettergrid/)).toBeNull()
    expect(dot(/^Sudoku/)).toBeTruthy()

    act(() => {
      c.openDaily(today())
      const session = c.getSnapshot().session!
      for (let p = 0; p < 81; p++) {
        if (session.state.board[p].given) continue
        session.select(p)
        session.tapNumber(session.state.solution[p].value)
      }
      c.goHome()
    })
    expect(dot(/^Sudoku/)).toBeNull()
  })
})

describe('Lettergrid Daily card', () => {
  it('goes from Play to Continue to View board and Play again, with the Streak and Score', async () => {
    const u = user()
    const c = setup()
    await openTab(u)
    const card = screen.getByLabelText('Lettergrid Daily Puzzle')
    expect(within(card).getByText('Streak 0 days')).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'Calendar' })).toBeTruthy()

    await u.click(within(card).getByRole('button', { name: 'Play' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    act(() => void lettergrid(c).swap())
    await u.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('tab', { name: /^Lettergrid/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()

    await u.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    expect(screen.getByText('5 of 6 Plays remaining')).toBeTruthy()
    finish(c)
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('button', { name: 'View board' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
    expect(within(screen.getByLabelText('Lettergrid Daily Puzzle')).getByText(/^Score \d+/)).toBeTruthy()
    expect(within(screen.getByLabelText('Lettergrid Daily Puzzle')).getByText('Streak 1 day')).toBeTruthy()
  })

  it('shows a loading state while the Word List loads, and a retry when it fails', async () => {
    const u = user()
    setup()
    let release!: (w: WordList) => void
    loader = () => new Promise((r) => (release = r))
    await openTab(u)
    await u.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading the Word List')
    expect(screen.queryByRole('group', { name: 'Lettergrid board' })).toBeNull()
    await act(async () => release(words))
    expect(await screen.findByRole('group', { name: 'Lettergrid board' })).toBeTruthy()
  })

  it('says so when the Word List cannot load, and Try again recovers', async () => {
    const u = user()
    setup()
    loader = async () => {
      throw new Error('offline')
    }
    await openTab(u)
    await u.click(screen.getByRole('button', { name: 'Play' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Word List/)
    loader = async () => words
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('group', { name: 'Lettergrid board' })).toBeTruthy()
  })
})

const rackTile = (letter: string) =>
  screen.getAllByRole('button', { name: new RegExp(`^Rack tile ${letter.toUpperCase()}, \\d+ points?$`) })[0]
const emptyCell = (row: number, col: number) => screen.getByRole('button', { name: new RegExp(`^Row ${row + 1}, column ${col + 1}, empty`) })

describe('making a Play', () => {
  it('accepts a legal Play: score rises, a Play is spent, the Rack refills', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    const s = lettergrid(c)
    const best = bestPlay(s.state, words)!
    for (const t of best.tiles) {
      await u.click(rackTile(t.letter))
      await u.click(emptyCell(t.row, t.col))
    }
    await u.click(screen.getByRole('button', { name: 'Submit Play' }))
    expect(await screen.findByText(`Play scored ${best.score}.`)).toBeTruthy()
    expect(screen.getByText(`Score ${best.score}`)).toBeTruthy()
    expect(screen.getByText('5 of 6 Plays remaining')).toBeTruthy()
    expect(lettergrid(c).state.plays).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Rack tile [A-Z], \d+ points?$/ })).toHaveLength(7)
  })

  it('rejects an invalid Play with a reason and places nothing', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    const letter = lettergrid(c).state.rack[0]
    await u.click(rackTile(letter))
    await u.click(emptyCell(0, 0))
    await u.click(screen.getByRole('button', { name: 'Submit Play' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/connect to a word/)
    expect(lettergrid(c).state.plays).toHaveLength(0)
    expect(lettergrid(c).state.grid[0]).toBeNull()
    expect(screen.getByText('6 of 6 Plays remaining')).toBeTruthy()
    // The tile is still only staged: taking it back empties the square again.
    await u.click(screen.getByRole('button', { name: 'Recall' }))
    expect(emptyCell(0, 0)).toBeTruthy()
  })

  it('names a word that is not in the Word List', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    const s = lettergrid(c)
    // Hang a single tile off the end of the Seed Word so it forms an unlikely word.
    const seed = s.state.seedCells
    const across = seed[1] - seed[0] === 1
    const step = across ? 1 : 9
    const last = seed[seed.length - 1]
    // Use whichever end of the Seed Word has room on the grid, in the same row or column.
    const room = (i: number) => i >= 0 && i < 81 && (across ? Math.floor(i / 9) === Math.floor(last / 9) : true)
    const after = room(last + step) ? last + step : seed[0] - step
    expect(room(after), 'a square beside the Seed Word is on the grid').toBe(true)
    const row = Math.floor(after / 9)
    const col = after % 9
    const seedWord = s.state.seedCells.map((i) => s.state.grid[i]).join('')
    const bad = [...s.state.rack].find((l) => !words.isWord(after > last ? seedWord + l : l + seedWord))
    expect(bad).toBeDefined()
    expect(s.state.grid[after]).toBeNull()
    await u.click(rackTile(bad!))
    await u.click(emptyCell(row, col))
    await u.click(screen.getByRole('button', { name: 'Submit Play' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/is not in the Word List/)
    expect(s.state.plays).toHaveLength(0)
  })

  it('places and takes back tiles from the keyboard', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    const letter = lettergrid(c).state.rack[0]
    await u.click(emptyCell(0, 0))
    await u.keyboard(letter)
    expect(screen.getByRole('button', { name: new RegExp(`^Row 1, column 1, ${letter.toUpperCase()}, \\d+ points?, placed this Play`) })).toBeTruthy()
    // The next square along is ready for the next tile.
    expect(screen.getByRole('button', { name: /^Row 1, column 2, empty/ })).toHaveFocus()
    await u.click(screen.getByRole('button', { name: /^Row 1, column 1, / }))
    expect(emptyCell(0, 0)).toBeTruthy()
    await u.click(emptyCell(0, 0))
    await u.keyboard(letter)
    await u.keyboard('{Backspace}')
    expect(emptyCell(0, 0)).toBeTruthy()
  })

  it('a Swap asks first, then spends a Play', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    const before = [...lettergrid(c).state.rack]
    await u.click(screen.getByRole('button', { name: 'Swap' }))
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(lettergrid(c).state.plays).toHaveLength(0)
    await u.click(screen.getByRole('button', { name: 'Swap' }))
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Swap' }))
    expect(lettergrid(c).state.plays).toHaveLength(1)
    expect(lettergrid(c).state.plays[0].kind).toBe('swap')
    expect(lettergrid(c).state.queue.slice(-7)).toEqual(before)
  })

  it('Back from the game returns Home', async () => {
    const u = user()
    setup()
    await playLettergrid(u)
    expect((window.history.state as { sudokuLevel: number }).sudokuLevel).toBe(1)
    act(() => window.history.back())
    await waitFor(() => expect(screen.getByRole('tablist')).toBeTruthy())
    expect(screen.getByRole('tab', { name: /^Lettergrid/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('finishing the Daily', () => {
  it('shows the score and stars, and Shares spoiler-free text', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    finish(c)
    const result = lettergrid(c).result!
    const dialog = await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
    expect(within(dialog).getByText(`Score ${result.score}`)).toBeTruthy()
    await u.click(within(dialog).getByRole('button', { name: 'Share' }))
    expect(copied).toEqual([
      `Lettergrid · Daily Puzzle Nov 3\n${result.plays.map((p) => p ?? '↺').join(' · ')} = ${result.score}${'★'.repeat(result.stars)}`.replace(
        /= (\d+)(★+)$/,
        '= $1 $2',
      ) + `\n${window.location.origin}`,
    ])
    expect(copied[0]).toContain('↺')
    expect(await screen.findByText('Copied to the clipboard.')).toBeTruthy()
  })

  it('is solved whatever the score: six Swaps score nothing and still count', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    finish(c, { firstPlay: false })
    expect(lettergrid(c).result).toMatchObject({ score: 0, stars: 0 })
    expect(c.profile.lettergridSolve(today())).not.toBeNull()
    await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
  })

  it('finishes when the sixth action is a Swap made through the button', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    act(() => {
      const s = lettergrid(c)
      for (let i = 0; i < 5; i++) expect(s.swap().ok).toBe(true)
    })
    await u.click(screen.getByRole('button', { name: 'Swap' }))
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Swap' }))
    expect(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).toBeTruthy()
  })
})

describe('Lettergrid Calendar', () => {
  it('shows On-Day and Catch-Up Solves with stars, opens past days, and keeps Share to scores', async () => {
    const u = user()
    const c = setup()
    const yesterday = today() - 1
    // Yesterday: opened and solved on the day.
    now = new Date(2026, 10, 2, 12)
    act(() => c.openLettergridDay(yesterday))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    finish(c)
    act(() => c.goHome())
    // Today: opened and solved on the day, so the Streak is 2.
    now = new Date(2026, 10, 3, 12)
    act(() => c.refreshToday())
    await u.click(screen.getByRole('tab', { name: /^Lettergrid/ }))
    await u.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    finish(c)
    // Today's Share carries the Streak...
    await u.click(await screen.findByRole('button', { name: 'Share' }))
    expect(copied[0]).toContain('🔥 2-day streak')
    await u.click(within(screen.getByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))

    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Calendar' })
    const yDay = within(sheet).getByRole('button', { name: /Monday, November 2, 2026, solved on the day, (no stars|\d stars?)/ })
    await u.click(yDay)
    // ...a past day's does not.
    await u.click(within(sheet).getByRole('button', { name: 'Share' }))
    expect(copied[1]).toMatch(/^Lettergrid · Daily Puzzle Nov 2\n/)
    expect(copied[1]).not.toContain('streak')

    // An unsolved past day opens as a Catch-Up game.
    await u.click(within(sheet).getByRole('button', { name: /Sunday, November 1, 2026, not solved/ }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    expect(c.profile.lettergridLog.firstOpened[today() - 2]).toBe(today())
    finish(c)
    expect(c.profile.lettergridLog.solves[today() - 2]).toBe('catchUp')
  })

  it('replays a solved day from the card and the Calendar, and the finish shows the best', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    finish(c)
    const first = c.profile.lettergridSolve(today())!
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))

    // Replay from the card: a fresh game on the same day; six Swaps score 0, lower than the first.
    await u.click(screen.getByRole('button', { name: 'Play again' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    expect(screen.getByText('6 of 6 Plays remaining')).toBeTruthy()
    for (let i = 0; i < 6; i++) act(() => void lettergrid(c).swap())
    const dialog = await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
    expect(within(dialog).getByText(`Best ${first.score}`)).toBeTruthy()
    expect(c.profile.lettergridSolve(today())).toEqual(first)

    // The finish offers Play again, which opens yet another fresh game.
    await u.click(within(dialog).getByRole('button', { name: 'Play again' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    act(() => void lettergrid(c).swap())
    await u.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()

    // The Calendar's result offers it too.
    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Calendar' })
    await u.click(within(sheet).getByRole('button', { name: /November 3, 2026, solved on the day/ }))
    await u.click(within(sheet).getByRole('button', { name: 'Continue' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    expect(screen.getByText('5 of 6 Plays remaining')).toBeTruthy()
  })

  it('does not open a future day, and Sudoku\'s Calendar and Streak stay untouched', async () => {
    const u = user()
    const c = setup()
    await openTab(u)
    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Calendar' })
    expect(within(sheet).getByRole('button', { name: /Wednesday, November 4, 2026, not available yet/ })).toBeDisabled()
    await u.click(within(sheet).getByRole('button', { name: 'Done' }))
    await u.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    finish(c)
    expect(c.profile.currentStreak(today() as CalendarDay)).toBe(0)
    expect(Object.keys(c.profile.dailyLog.solves)).toHaveLength(0)
  })
})

describe('Lettergrid Statistics', () => {
  it('lists Dailies played, best score and Par tiers reached', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    finish(c)
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))
    await u.click(screen.getByRole('button', { name: 'Statistics' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Statistics' })
    const stats = c.profile.lettergridStatistics
    expect(within(sheet).getByText('Dailies played').nextSibling).toHaveTextContent('1')
    expect(within(sheet).getByText('Best score').nextSibling).toHaveTextContent(String(stats.bestScore))
    stats.parReached.forEach((n, i) => {
      const label = `${i + 1} ${i === 0 ? 'star' : 'stars'} Par reached`
      expect(within(sheet).getByText(label).nextSibling).toHaveTextContent(String(n))
    })
  })
})

describe('Lettergrid Final Board', () => {
  it('views the final board from the finish overlay, then brings the result back', async () => {
    const u = user()
    const c = setup()
    await playLettergrid(u)
    finish(c)
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'View board' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('group', { name: 'Lettergrid board' })).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Result' }))
    expect(screen.getByRole('dialog', { name: 'Daily Puzzle Solved!' })).toBeTruthy()
  })

  it('replays a solved day\'s board Play by Play from Home, any time later', async () => {
    const u = user()
    const store = new MemoryStore()
    const c = setup(store)
    await playLettergrid(u)
    finish(c)
    const finalGrid = [...lettergrid(c).state.grid]
    const placed = lettergrid(c).state.plays[0].tiles.length
    await u.click(within(await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })).getByRole('button', { name: 'Home' }))

    // A new app instance on a later day still has it.
    cleanup()
    now = new Date(2026, 10, 9, 12)
    setup(store)
    await openTab(u)
    await u.click(screen.getByRole('button', { name: 'Calendar' }))
    await u.click(screen.getByRole('button', { name: /Tuesday, November 3, 2026, solved/ }))
    await u.click(screen.getByRole('button', { name: 'View board' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Board' })
    const board = within(sheet).getByRole('img', { name: 'Lettergrid board after 6 of 6 Plays' })
    const letters = () => board.querySelectorAll('.lg-cell.tile').length
    expect(letters()).toBe(finalGrid.filter(Boolean).length)
    await u.click(within(sheet).getByRole('button', { name: 'First: the opening grid' }))
    const seed = letters()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Start: the Seed Word')
    await u.click(within(sheet).getByRole('button', { name: 'Next' }))
    expect(letters()).toBe(seed + placed)
    expect(within(sheet).getByRole('status')).toHaveTextContent(/Play 1 of 6: \+\d+/)

    // Done goes back to the Calendar it came from.
    await u.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('dialog', { name: 'Lettergrid Calendar' })).toBeTruthy()
  })

  it('shows the best solve\'s board: a higher Replay replaces it, a lower one is not kept', async () => {
    const u = user()
    const c = setup()
    const solves = () => Object.values(c.profile.syncDoc().lettergrid.solves)
    await playLettergrid(u)
    finish(c, { firstPlay: false }) // six Swaps: solved with 0
    const seedOnly = lettergrid(c).state.grid.filter(Boolean).length
    let dialog = await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
    expect(within(dialog).queryByText('New best!')).toBeNull()

    // A higher Replay becomes the day's only solve, and its board is the one shown.
    await u.click(within(dialog).getByRole('button', { name: 'Play again' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    finish(c)
    const higher = c.profile.lettergridSolve(today())!
    expect(higher.score).toBeGreaterThan(0)
    const grid = lettergrid(c).state.grid.filter(Boolean).length
    expect(grid).toBeGreaterThan(seedOnly)
    dialog = await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
    expect(within(dialog).getByText('New best!')).toBeTruthy()
    expect(solves()).toEqual([higher])

    // A lower Replay is dropped; the day keeps the higher solve and its board.
    await u.click(within(dialog).getByRole('button', { name: 'Play again' }))
    await screen.findByRole('group', { name: 'Lettergrid board' })
    finish(c, { firstPlay: false })
    dialog = await screen.findByRole('dialog', { name: 'Daily Puzzle Solved!' })
    expect(within(dialog).getByText(`Best ${higher.score}`)).toBeTruthy()
    expect(within(dialog).queryByText('New best!')).toBeNull()
    expect(solves()).toEqual([higher])
    expect(c.profile.hasLettergridInProgress(today())).toBe(false)

    await u.click(within(dialog).getByRole('button', { name: 'Home' }))
    await u.click(screen.getByRole('button', { name: 'View board' }))
    const sheet = screen.getByRole('dialog', { name: 'Lettergrid Board' })
    expect(within(sheet).getByText(new RegExp(`^Score ${higher.score}`))).toBeTruthy()
    expect(within(sheet).getByRole('img', { name: 'Lettergrid board after 6 of 6 Plays' }).querySelectorAll('.lg-cell.tile')).toHaveLength(grid)
  })
})
