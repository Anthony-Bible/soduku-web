import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import * as G from './gameState'
import { maxHints } from './difficulty'
import { ALL_POSITIONS, type Position } from './position'
import { arbDifficulty, arbSeed, gameFor } from './fixtures'

type Action =
  | { t: 'enter'; p: Position; n: number }
  | { t: 'note'; p: Position; n: number }
  | { t: 'erase'; p: Position }
  | { t: 'hint'; p: Position }
  | { t: 'notesMode' }
const arbAction = fc.oneof(
  fc.record({ t: fc.constant('enter' as const), p: fc.integer({ min: 0, max: 80 }), n: fc.integer({ min: 1, max: 9 }) }),
  fc.record({ t: fc.constant('note' as const), p: fc.integer({ min: 0, max: 80 }), n: fc.integer({ min: 1, max: 9 }) }),
  fc.record({ t: fc.constant('erase' as const), p: fc.integer({ min: 0, max: 80 }) }),
  fc.record({ t: fc.constant('hint' as const), p: fc.integer({ min: 0, max: 80 }) }),
  fc.constant({ t: 'notesMode' as const }),
)

function apply(s: G.GameState, a: Action): G.GameState {
  switch (a.t) {
    case 'enter': return G.enter(s, a.n, a.p).state
    case 'note': return G.toggleNote(s, a.n, a.p).state
    case 'erase': return G.erase(s, a.p).state
    case 'hint': return G.hint(G.select(s, a.p)).state
    case 'notesMode': return G.toggleNotesMode(s)
  }
}

const stripBookkeeping = (s: G.GameState) => ({ board: s.board, mistakes: s.mistakes, hintsUsed: s.hintsUsed })

describe('GameState', () => {
  const game = gameFor('medium', 99n)
  const empty = ALL_POSITIONS.filter((p) => !game.board[p].given)
  const answer = (p: Position) => game.solution[p].value
  const wrongFor = (p: Position) => (answer(p) % 9) + 1

  test('a correct entry is applied, a wrong one is a counted Mistake that never ends the Game', () => {
    const p = empty[0]
    const bad = G.enter(game, wrongFor(p), p)
    expect(bad.outcome).toBe('mistake')
    expect(bad.state.mistakes).toBe(1)
    expect(bad.state.status).toBe('playing')
    expect(G.isWrong(bad.state, p)).toBe(true)
    // many mistakes still leave the game playing
    let s = game
    for (const q of empty.slice(0, 20)) s = G.enter(s, wrongFor(q), q).state
    expect(s.mistakes).toBe(20)
    expect(s.status).toBe('playing')
    const good = G.enter(bad.state, answer(p), p)
    expect(good.outcome).not.toBe('mistake')
    expect(good.state.mistakes).toBe(1)
  })

  test('givens cannot be changed; entering the same value again is ignored', () => {
    const given = ALL_POSITIONS.find((p) => game.board[p].given)!
    expect(G.enter(game, 1, given).outcome).toBe('ignored')
    expect(G.erase(game, given).outcome).toBe('ignored')
    const p = empty[0]
    const once = G.enter(game, answer(p), p).state
    expect(G.enter(once, answer(p), p).outcome).toBe('ignored')
  })

  test('filling every cell correctly wins; the last move is reported as won', () => {
    let s = game
    let last: G.Outcome = 'ignored'
    for (const p of empty) {
      const r = G.enter(s, answer(p), p)
      s = r.state
      last = r.outcome
    }
    expect(last).toBe('won')
    expect(s.status).toBe('won')
    expect(G.isComplete(s)).toBe(true)
    expect(G.enter(s, 1, empty[0]).outcome).toBe('ignored') // no moves once won
  })

  test('notes mode toggles pencil marks instead of entering; a value clears notes and peers lose the note', () => {
    const p = empty[0]
    let s = G.select(G.toggleNotesMode(game), p)
    s = G.enter(s, 3, p).state
    s = G.enter(s, 5, p).state
    expect(s.board[p].notes).toBe((1 << 2) | (1 << 4))
    expect(s.board[p].value).toBe(0)
    s = G.enter(s, 3, p).state // toggles off
    expect(s.board[p].notes).toBe(1 << 4)
    // peer in same unit with note n loses it when n is placed
    const q = empty.find((x) => x !== p && G.completedUnits !== undefined && game.board[x].value === 0 && (x % 9 === p % 9 || Math.floor(x / 9) === Math.floor(p / 9)))!
    const n = answer(p)
    let t = G.toggleNote(game, n, q).state
    expect(t.board[q].notes & (1 << (n - 1))).not.toBe(0)
    t = G.enter(t, n, p).state
    expect(t.board[q].notes & (1 << (n - 1))).toBe(0)
    expect(t.board[p].notes).toBe(0)
  })

  test('property: undo restores the exact prior board for every action', () => {
    fc.assert(
      fc.property(arbDifficulty, arbSeed, fc.array(arbAction, { maxLength: 30 }), (d, seed, actions) => {
        let s = gameFor(d, seed)
        for (const a of actions) {
          const before = s
          const after = apply(s, a)
          if (after.history.length === before.history.length + 1) {
            const undone = G.undo(after).state
            expect(undone.board).toEqual(before.board)
            expect(undone.history).toEqual(before.history)
          }
          s = after
        }
        // unwinding the whole history returns to the starting board (hints/mistakes counters are not refunded)
        let u = s
        while (u.history.length > 0) u = G.undo(u).state
        expect(u.board).toEqual(gameFor(d, seed).board)
      }),
      { numRuns: 40 },
    )
  })

  test('property: counters only grow, givens never change, hints never exceed the limit', () => {
    fc.assert(
      fc.property(arbDifficulty, arbSeed, fc.array(arbAction, { maxLength: 40 }), (d, seed, actions) => {
        const start = gameFor(d, seed)
        let s = start
        for (const a of actions) {
          const next = apply(s, a)
          expect(next.mistakes).toBeGreaterThanOrEqual(s.mistakes)
          expect(next.hintsUsed).toBeGreaterThanOrEqual(s.hintsUsed)
          s = next
        }
        expect(s.hintsUsed).toBeLessThanOrEqual(maxHints(d))
        start.board.forEach((c, i) => c.given && expect(s.board[i]).toEqual(c))
        expect(stripBookkeeping(s).mistakes).toBeLessThanOrEqual(actions.length)
      }),
      { numRuns: 40 },
    )
  })

  test('hint fills the selected empty/wrong cell, else the first empty cell, and spends a hint', () => {
    const p = empty[3]
    const sel = G.hint(G.select(game, p))
    expect(sel.state.board[p].value).toBe(answer(p))
    expect(sel.state.hintsUsed).toBe(1)
    const first = G.hint(game)
    expect(first.state.board[empty[0]].value).toBe(answer(empty[0]))
    // a selected wrong cell is fixed
    const wrong = G.enter(game, wrongFor(p), p).state
    const fixed = G.hint(G.select(wrong, p)).state
    expect(fixed.board[p].value).toBe(answer(p))
  })

  test('hints run out per difficulty', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      let s = gameFor(d, 5n)
      for (let i = 0; i < 10; i++) s = G.hint(s).state
      expect(s.hintsUsed).toBe(maxHints(d))
      expect(G.hintsRemaining(s)).toBe(0)
    }
  })

  test('pause stops input and the clock; resume restores play', () => {
    const paused = G.pause(game)
    expect(paused.status).toBe('paused')
    expect(G.enter(paused, 1, empty[0]).outcome).toBe('ignored')
    expect(G.addElapsed(paused, 5).elapsedSeconds).toBe(0)
    expect(G.addElapsed(G.resume(paused), 5).elapsedSeconds).toBe(5)
  })

  test('completedUnits reports the row, column or box a move finished', () => {
    let s = game
    const row0 = ALL_POSITIONS.filter((p) => p < 9 && !game.board[p].given)
    let result = new Set<Position>()
    for (const p of row0) {
      s = G.enter(s, answer(p), p).state
      result = G.completedUnits(s, p)
    }
    expect([...result].filter((p) => p < 9)).toHaveLength(9)
  })
})
