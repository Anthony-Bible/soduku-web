import { CELL_COUNT, PLAYS_PER_DAILY, cellIndex, type Bonus, type Cell } from './grid'
import type { LettergridState } from './game'

/**
 * A finished Daily's board, kept with its solve so it can be looked at (and stepped through Play by Play) long
 * after the Game itself is gone. Stored compactly because every solve lives in the synced document.
 */
export interface LettergridBoard {
  /** The final grid, one character per cell in row order: a letter, or '.' for an empty square. */
  readonly grid: string
  /** One character per cell: '.' none, 'd' L×2, 't' L×3, 'D' W×2, 'T' W×3. */
  readonly bonuses: string
  /** The cells each Play placed, in Play order; a Swap placed none. */
  readonly plays: readonly (readonly number[])[]
}

const BONUS_CODE: Record<Exclude<Bonus, null>, string> = { L2: 'd', L3: 't', W2: 'D', W3: 'T' }
const CODE_BONUS: Record<string, Bonus> = { d: 'L2', t: 'L3', D: 'W2', T: 'W3' }

export function boardOf(state: LettergridState): LettergridBoard {
  return {
    grid: state.grid.map((c) => c ?? '.').join(''),
    bonuses: state.bonuses.map((b) => (b ? BONUS_CODE[b] : '.')).join(''),
    plays: state.plays.map((p) => p.tiles.map((t) => cellIndex(t.row, t.col))),
  }
}

/** Structural check of an untrusted board: every placed cell holds a letter and is placed only once. */
export function isLettergridBoard(v: unknown): v is LettergridBoard {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  if (typeof b.grid !== 'string' || !new RegExp(`^[a-z.]{${CELL_COUNT}}$`).test(b.grid)) return false
  if (typeof b.bonuses !== 'string' || !new RegExp(`^[.dtDT]{${CELL_COUNT}}$`).test(b.bonuses)) return false
  if (!Array.isArray(b.plays) || b.plays.length !== PLAYS_PER_DAILY) return false
  const seen = new Set<number>()
  for (const play of b.plays) {
    if (!Array.isArray(play)) return false
    for (const cell of play) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || seen.has(cell) || b.grid[cell] === '.') return false
      seen.add(cell)
    }
  }
  return true
}

export const copyBoard = (b: LettergridBoard): LettergridBoard => ({ grid: b.grid, bonuses: b.bonuses, plays: b.plays.map((p) => [...p]) })

/** One step of a Final Board: the grid after `step` Plays (0 is the opening grid with only the Seed Word). */
export interface BoardFrame {
  readonly grid: Cell[]
  readonly bonuses: Bonus[]
  /** Cells holding the Seed Word. */
  readonly seedCells: ReadonlySet<number>
  /** Cells the last Play shown placed. */
  readonly placed: ReadonlySet<number>
}

export function boardFrame(board: LettergridBoard, step: number): BoardFrame {
  const later = new Set(board.plays.slice(step).flat())
  const played = new Set(board.plays.flat())
  const grid: Cell[] = []
  const seedCells = new Set<number>()
  for (let i = 0; i < CELL_COUNT; i++) {
    const c = board.grid[i]
    grid.push(c === '.' || later.has(i) ? null : c)
    if (c !== '.' && !played.has(i)) seedCells.add(i)
  }
  return {
    grid,
    bonuses: [...board.bonuses].map((c) => CODE_BONUS[c] ?? null),
    seedCells,
    placed: new Set(step > 0 ? board.plays[step - 1] : []),
  }
}
