import { type CalendarDay } from '../calendarDay'
import { mix64, SeededRandom } from '../random'
import { generateBonuses } from './bonuses'
import {
  CENTRE,
  GRID_SIZE,
  emptyGrid,
  lineCells,
  type Bonus,
  type Cell,
  type Direction,
  type Pos,
} from './grid'
import { newGame, type LettergridState } from './game'
import { PAR_SOLVER_VERSION, parFromGreedy, type Par } from './par'
import { solveGreedy } from './solver'
import { generateTileRun } from './tileRun'
import type { WordList } from './wordList'

/**
 * The Lettergrid generator version. Bump only together with a new generation path picked by date,
 * so earlier days keep their puzzles (ADR 0001 / 0003).
 */
export const LETTERGRID_GENERATOR_VERSION = 1

/** Which generator version publishes `day`. Only v1 exists, so every day maps to it. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the date picks the version once there are several
export const generatorVersionFor = (_day: CalendarDay): number => LETTERGRID_GENERATOR_VERSION

/**
 * The Word List version each Daily is published with, as `[first day, version]` rows in date order.
 * To publish a new version, append a row starting on a FUTURE day. Never edit or remove a row:
 * every past day must keep the Word List, Seed Word and Par it was published with (ADR 0003).
 * This is deliberately independent of CURRENT_WORD_LIST_VERSION, which only names the newest build.
 */
export const WORD_LIST_SCHEDULE: readonly (readonly [from: CalendarDay, version: number])[] = [
  [Number.NEGATIVE_INFINITY, 1],
]

/** Which Word List version `day`'s Daily is published with, picked by date from WORD_LIST_SCHEDULE. */
export function wordListVersionFor(day: CalendarDay): number {
  let version = WORD_LIST_SCHEDULE[0][1]
  for (const [from, v] of WORD_LIST_SCHEDULE) if (day >= from) version = v
  return version
}

/** Which Par solver version scores `day`'s Daily. Only v1 exists, so every day maps to it. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the date picks the version once there are several
export const parSolverVersionFor = (_day: CalendarDay): number => PAR_SOLVER_VERSION

/** Distinct from Sudoku's seed for the same day. */
export function lettergridSeed(day: CalendarDay): bigint {
  const ordinal = BigInt.asUintN(64, BigInt(day))
  return mix64((BigInt(generatorVersionFor(day)) << 48n) ^ ordinal ^ 0x1e77_e7a1_d000_0000n)
}

/** Everything about a day's puzzle except its Par. */
export interface LettergridLayout {
  generatorVersion: number
  wordListVersion: number
  seedWord: string
  seedStart: Pos
  seedDirection: Direction
  bonuses: Bonus[]
  tileRun: string[]
}

export interface LettergridDaily extends LettergridLayout {
  grid: Cell[]
  seedCells: number[]
  par: Par
}

/**
 * The layout for `day`: bonus squares, a Seed Word through the centre, then the Tile Run, drawn in
 * that order from the day's seed. The order is part of the frozen v1 contract.
 */
export function generateLayout(day: CalendarDay, words: WordList): LettergridLayout {
  const wordListVersion = wordListVersionFor(day)
  if (words.version !== wordListVersion) {
    throw new Error(`Day ${day} is published with Word List v${wordListVersion}, got v${words.version}`)
  }
  if (words.seedCandidates.length === 0) throw new Error('Word List has no Seed Word candidates')
  const rng = new SeededRandom(lettergridSeed(day))
  const bonuses = generateBonuses(rng)
  const seedWord = words.seedCandidates[rng.nextBelow(words.seedCandidates.length)]
  const seedDirection: Direction = rng.nextBelow(2) === 0 ? 'across' : 'down'
  // The word must cover the centre line's centre cell and stay on the grid.
  const first = Math.max(0, CENTRE - (seedWord.length - 1))
  const last = Math.min(CENTRE, GRID_SIZE - seedWord.length)
  const offset = first + rng.nextBelow(last - first + 1)
  const seedStart: Pos = seedDirection === 'across' ? { row: CENTRE, col: offset } : { row: offset, col: CENTRE }
  const tileRun = generateTileRun(rng)
  return { generatorVersion: generatorVersionFor(day), wordListVersion, seedWord, seedStart, seedDirection, bonuses, tileRun }
}

function startState(layout: LettergridLayout, par: Par): LettergridState {
  const grid = emptyGrid()
  const seedCells = lineCells(layout.seedStart, layout.seedDirection, layout.seedWord.length)
  seedCells.forEach((cell, k) => {
    grid[cell] = layout.seedWord[k]
  })
  return newGame({ ...layout, grid, seedCells, par })
}

const NO_PAR: Par = { solverVersion: 0, greedyScore: 0, tiers: [1, 2, 3] }

/** The Daily Puzzle for `day`: the layout plus its Par from the greedy solver. */
export function lettergridDaily(day: CalendarDay, words: WordList): LettergridDaily {
  const layout = generateLayout(day, words)
  const solverVersion = parSolverVersionFor(day)
  if (solverVersion !== 1) throw new Error(`No Par solver v${solverVersion}`)
  // The solver never mutates the state it is given, so its start grid is the Daily's.
  const start = startState(layout, NO_PAR)
  const greedy = solveGreedy(start, words)
  return { ...layout, grid: start.grid, seedCells: start.seedCells, par: parFromGreedy(greedy.score, solverVersion) }
}
