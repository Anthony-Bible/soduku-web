import {
  ALL_TILES_BONUS,
  cellIndex,
  GRID_SIZE,
  neighbours,
  RACK_SIZE,
  runOf,
  type Bonus,
  type Cell,
  type Direction,
  type PlacedTile,
} from './grid'

export type RejectReason =
  | 'empty'
  | 'too-many-tiles'
  | 'off-grid'
  | 'bad-letter'
  | 'occupied'
  | 'duplicate-cell'
  | 'not-in-line'
  | 'gap'
  | 'not-connected'
  | 'not-a-word'

export interface FormedWord {
  word: string
  score: number
  cells: number[]
}

export type Evaluation =
  | { ok: true; words: FormedWord[]; score: number; usedAllTiles: boolean }
  | { ok: false; reason: RejectReason; word?: string }

/**
 * Checks a placement against the rules and scores it. Pure: the grid is never touched, so a
 * rejected placement can never leave anything behind.
 *
 * Rules: tiles go in one row or column onto empty cells; with the tiles already in that line they
 * form one gap-free run; at least one new tile touches an existing tile; every word formed (the
 * line's run plus each new tile's crossing run, runs of 2+ only) is in the Word List.
 *
 * Score: for each word, the sum of letter value x letter bonus (new tiles only), times the word
 * bonuses of the new tiles in it; summed over all words, plus ALL_TILES_BONUS for a full Rack.
 */
export function evaluatePlay(
  grid: readonly Cell[],
  bonuses: readonly Bonus[],
  tiles: readonly PlacedTile[],
  values: Readonly<Record<string, number>>,
  isWord: (word: string) => boolean,
): Evaluation {
  if (tiles.length === 0) return { ok: false, reason: 'empty' }
  if (tiles.length > RACK_SIZE) return { ok: false, reason: 'too-many-tiles' }

  const placed = new Map<number, string>()
  for (const t of tiles) {
    if (!Number.isInteger(t.row) || !Number.isInteger(t.col)) return { ok: false, reason: 'off-grid' }
    if (t.row < 0 || t.row >= GRID_SIZE || t.col < 0 || t.col >= GRID_SIZE) return { ok: false, reason: 'off-grid' }
    if (!/^[a-z]$/.test(t.letter)) return { ok: false, reason: 'bad-letter' }
    const idx = cellIndex(t.row, t.col)
    if (grid[idx] !== null) return { ok: false, reason: 'occupied' }
    if (placed.has(idx)) return { ok: false, reason: 'duplicate-cell' }
    placed.set(idx, t.letter)
  }

  const sameRow = tiles.every((t) => t.row === tiles[0].row)
  const sameCol = tiles.every((t) => t.col === tiles[0].col)
  if (!sameRow && !sameCol) return { ok: false, reason: 'not-in-line' }

  const at = (i: number): Cell => placed.get(i) ?? grid[i]
  const first = cellIndex(tiles[0].row, tiles[0].col)
  const runs: number[][] = []
  if (tiles.length === 1) {
    for (const dir of ['across', 'down'] as Direction[]) {
      const run = runOf(at, first, dir)
      if (run.length > 1) runs.push(run)
    }
  } else {
    const dir: Direction = sameRow ? 'across' : 'down'
    const main = runOf(at, first, dir)
    const inMain = new Set(main)
    for (const idx of placed.keys()) if (!inMain.has(idx)) return { ok: false, reason: 'gap' }
    runs.push(main)
    const cross: Direction = sameRow ? 'down' : 'across'
    for (const idx of placed.keys()) {
      const run = runOf(at, idx, cross)
      if (run.length > 1) runs.push(run)
    }
  }

  const touches = [...placed.keys()].some((idx) =>
    neighbours(idx).some((n) => grid[n] !== null),
  )
  if (!touches) return { ok: false, reason: 'not-connected' }

  const words: FormedWord[] = []
  let score = 0
  for (const cells of runs) {
    const word = cells.map((i) => at(i)).join('')
    if (!isWord(word)) return { ok: false, reason: 'not-a-word', word }
    let sum = 0
    let multiplier = 1
    for (const i of cells) {
      let value = values[at(i) as string] ?? 0
      if (placed.has(i)) {
        const bonus = bonuses[i]
        if (bonus === 'L2') value *= 2
        else if (bonus === 'L3') value *= 3
        else if (bonus === 'W2') multiplier *= 2
        else if (bonus === 'W3') multiplier *= 3
      }
      sum += value
    }
    words.push({ word, score: sum * multiplier, cells })
    score += sum * multiplier
  }
  const usedAllTiles = tiles.length === RACK_SIZE
  if (usedAllTiles) score += ALL_TILES_BONUS
  return { ok: true, words, score, usedAllTiles }
}

