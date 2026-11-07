import { evaluatePlay, type RejectReason } from './evaluate'
import { PLAYS_PER_DAILY, RACK_SIZE, type Bonus, type Cell, type PlacedTile, cellIndex } from './grid'
import { letterValuesFor } from './letterValuesTable'
import { starsFor, type Par } from './par'
import type { WordList } from './wordList'

/** One of the Daily's Plays: letters placed, or a Swap (score 0, no tiles). */
export interface PlayRecord {
  kind: 'play' | 'swap'
  score: number
  tiles: PlacedTile[]
}

/**
 * A Lettergrid game in progress. Plain data so it saves and syncs as JSON, and it carries its own
 * grid, Tile Run and Par: a version change never touches a game already begun (ADR 0003).
 *
 * Tiles are conserved: the letters placed by Plays, the `rack` and the `queue` are always exactly
 * the `tileRun`.
 */
export interface LettergridState {
  generatorVersion: number
  wordListVersion: number
  grid: Cell[]
  bonuses: Bonus[]
  /** Cells holding the Seed Word (not drawn from the Tile Run). */
  seedCells: number[]
  /** The whole Tile Run as dealt, never changed. */
  tileRun: string[]
  /** Letters not yet dealt, in order; a Swap sends the Rack to the back. */
  queue: string[]
  rack: string[]
  plays: PlayRecord[]
  par: Par
}

/** What a new game is dealt from: everything but the Rack, the undealt letters and the Plays. */
export type LettergridStart = Omit<LettergridState, 'queue' | 'rack' | 'plays'>

export function newGame(start: LettergridStart): LettergridState {
  return {
    generatorVersion: start.generatorVersion,
    wordListVersion: start.wordListVersion,
    grid: [...start.grid],
    bonuses: [...start.bonuses],
    seedCells: [...start.seedCells],
    tileRun: [...start.tileRun],
    queue: start.tileRun.slice(RACK_SIZE),
    rack: start.tileRun.slice(0, RACK_SIZE),
    plays: [],
    par: { ...start.par, tiers: [...start.par.tiers] },
  }
}

export const scoreOf = (state: LettergridState): number => state.plays.reduce((n, p) => n + p.score, 0)
export const playsLeft = (state: LettergridState): number => PLAYS_PER_DAILY - state.plays.length
/** A Lettergrid Daily is solved once all its Plays are made, whatever the score. */
export const isFinished = (state: LettergridState): boolean => state.plays.length >= PLAYS_PER_DAILY

/** What a game scored: the finish overlay, the Share text and the recorded solve all read this. */
export interface LettergridResult {
  readonly score: number
  /** Par tiers reached, 0 to 3, fixed by the Par the Daily was played with. */
  readonly stars: 0 | 1 | 2 | 3
  /** Score of each Play in order; null marks a Swap (the Share text shows it as a loop arrow). */
  readonly plays: readonly (number | null)[]
}

export function resultOf(state: LettergridState): LettergridResult {
  const score = scoreOf(state)
  return { score, stars: starsFor(score, state.par), plays: state.plays.map((p) => (p.kind === 'swap' ? null : p.score)) }
}

export type Action = { type: 'play'; tiles: readonly PlacedTile[] } | { type: 'swap' }

export type ActionResult =
  | { ok: true; state: LettergridState; score: number }
  | { ok: false; reason: RejectReason | 'finished' | 'not-in-rack' | 'wrong-word-list'; word?: string }

/**
 * The reducer. A rejected action returns the reason and no state, so the caller's state cannot
 * change; an accepted one returns a new state and never mutates the old.
 */
export function applyAction(state: LettergridState, action: Action, words: WordList): ActionResult {
  if (isFinished(state)) return { ok: false, reason: 'finished' }
  if (words.version !== state.wordListVersion) return { ok: false, reason: 'wrong-word-list' }

  if (action.type === 'swap') {
    const queue = [...state.queue, ...state.rack]
    return {
      ok: true,
      score: 0,
      state: {
        ...state,
        rack: queue.slice(0, RACK_SIZE),
        queue: queue.slice(RACK_SIZE),
        plays: [...state.plays, { kind: 'swap', score: 0, tiles: [] }],
      },
    }
  }

  const remaining = [...state.rack]
  for (const tile of action.tiles) {
    const at = remaining.indexOf(tile.letter)
    if (at < 0) return { ok: false, reason: 'not-in-rack' }
    remaining.splice(at, 1)
  }
  const evaluation = evaluatePlay(
    state.grid,
    state.bonuses,
    action.tiles,
    letterValuesFor(state.wordListVersion),
    (w) => words.isWord(w),
  )
  if (!evaluation.ok) return evaluation

  const grid = [...state.grid]
  for (const t of action.tiles) grid[cellIndex(t.row, t.col)] = t.letter
  const need = RACK_SIZE - remaining.length
  return {
    ok: true,
    score: evaluation.score,
    state: {
      ...state,
      grid,
      rack: [...remaining, ...state.queue.slice(0, need)],
      queue: state.queue.slice(need),
      plays: [
        ...state.plays,
        { kind: 'play', score: evaluation.score, tiles: action.tiles.map((t) => ({ ...t })) },
      ],
    },
  }
}
