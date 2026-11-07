/** Grid geometry and the shared vocabulary of Lettergrid's pure core. */

export const GRID_SIZE = 9
export const CELL_COUNT = GRID_SIZE * GRID_SIZE
export const CENTRE = 4
export const RACK_SIZE = 7
export const TILE_RUN_LENGTH = 28
export const PLAYS_PER_DAILY = 6
/** Added to a Play that uses every tile of a full Rack. */
export const ALL_TILES_BONUS = 25

/** A bonus square: letter x2 / x3, word x2 / x3, or none. Applies only to a tile placed on it. */
export type Bonus = 'L2' | 'L3' | 'W2' | 'W3' | null
/** A lowercase letter a-z, or empty. */
export type Cell = string | null
export type Direction = 'across' | 'down'

export interface Pos {
  row: number
  col: number
}
export interface PlacedTile extends Pos {
  letter: string
}

export const cellIndex = (row: number, col: number): number => row * GRID_SIZE + col
export const rowOf = (idx: number): number => Math.floor(idx / GRID_SIZE)
export const colOf = (idx: number): number => idx % GRID_SIZE
export const emptyGrid = (): Cell[] => Array.from({ length: CELL_COUNT }, () => null)

/** The maximal run of filled cells (per `at`) through `idx` along `dir`, in grid order. */
export function runOf(at: (idx: number) => Cell, idx: number, dir: Direction): number[] {
  let row = rowOf(idx)
  let col = colOf(idx)
  const dr = dir === 'down' ? 1 : 0
  const dc = dir === 'across' ? 1 : 0
  while (row - dr >= 0 && col - dc >= 0 && at(cellIndex(row - dr, col - dc)) !== null) {
    row -= dr
    col -= dc
  }
  const out: number[] = []
  while (row < GRID_SIZE && col < GRID_SIZE && at(cellIndex(row, col)) !== null) {
    out.push(cellIndex(row, col))
    row += dr
    col += dc
  }
  return out
}

/** The cells a word of `length` occupies starting at `start` along `dir`. */
export function lineCells(start: Pos, dir: Direction, length: number): number[] {
  return Array.from({ length }, (_, k) =>
    dir === 'across' ? cellIndex(start.row, start.col + k) : cellIndex(start.row + k, start.col),
  )
}

/** The up to four cells sharing an edge with `idx`. */
export function neighbours(idx: number): number[] {
  const r = rowOf(idx)
  const c = colOf(idx)
  const out: number[] = []
  if (r > 0) out.push(cellIndex(r - 1, c))
  if (r < GRID_SIZE - 1) out.push(cellIndex(r + 1, c))
  if (c > 0) out.push(cellIndex(r, c - 1))
  if (c < GRID_SIZE - 1) out.push(cellIndex(r, c + 1))
  return out
}
