import { boardFromValues, valuesOf, type Board } from './board'

export type SolutionCount = 'none' | 'unique' | 'multiple'

interface SearchState {
  values: number[]
  rows: number[]
  cols: number[]
  boxes: number[]
}

const popcount = (n: number): number => {
  let c = 0
  for (let m = n; m; m &= m - 1) c++
  return c
}

/** Null if the values are malformed or contain a duplicate in a unit. */
function makeState(values: readonly number[]): SearchState | null {
  if (values.length !== 81) return null
  const s: SearchState = {
    values: values.slice(),
    rows: new Array<number>(9).fill(0),
    cols: new Array<number>(9).fill(0),
    boxes: new Array<number>(9).fill(0),
  }
  for (let i = 0; i < 81; i++) {
    const v = values[i]
    if (v === 0) continue
    if (!Number.isInteger(v) || v < 1 || v > 9) return null
    const bit = 1 << (v - 1)
    const r = Math.floor(i / 9)
    const c = i % 9
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
    if (s.rows[r] & bit || s.cols[c] & bit || s.boxes[b] & bit) return null
    s.rows[r] |= bit
    s.cols[c] |= bit
    s.boxes[b] |= bit
  }
  return s
}

interface Result {
  count: number
  first: number[] | null
}

/** Backtracking with the minimum-remaining-values heuristic. */
function search(s: SearchState, limit: number, out: Result): void {
  let bestIndex = -1
  let bestMask = 0
  let bestCount = 10
  for (let i = 0; i < 81; i++) {
    if (s.values[i] !== 0) continue
    const r = Math.floor(i / 9)
    const c = i % 9
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
    const avail = ~(s.rows[r] | s.cols[c] | s.boxes[b]) & 0x1ff
    const n = popcount(avail)
    if (n === 0) return
    if (n < bestCount) {
      bestCount = n
      bestIndex = i
      bestMask = avail
      if (n === 1) break
    }
  }
  if (bestIndex < 0) {
    out.count++
    if (out.first === null) out.first = s.values.slice()
    return
  }
  const r = Math.floor(bestIndex / 9)
  const c = bestIndex % 9
  const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
  let mask = bestMask
  while (mask !== 0) {
    const bit = mask & -mask
    mask &= mask - 1
    s.values[bestIndex] = 31 - Math.clz32(bit) + 1
    s.rows[r] |= bit
    s.cols[c] |= bit
    s.boxes[b] |= bit
    search(s, limit, out)
    s.values[bestIndex] = 0
    s.rows[r] &= ~bit
    s.cols[c] &= ~bit
    s.boxes[b] &= ~bit
    if (out.count >= limit) return
  }
}

/** A solved board (all cells given), or null if there is no solution. */
export function solve(board: Board): Board | null {
  const s = makeState(valuesOf(board))
  if (!s) return null
  const out: Result = { count: 0, first: null }
  search(s, 1, out)
  return out.first ? boardFromValues(out.first) : null
}

/** Counts solutions up to `limit` (early exit). 'multiple' needs limit >= 2. */
export function countSolutionsOfValues(values: readonly number[], limit = 2): SolutionCount {
  const s = makeState(values)
  if (!s) return 'none'
  const out: Result = { count: 0, first: null }
  search(s, Math.max(1, limit), out)
  if (out.count === 0) return 'none'
  return out.count === 1 ? 'unique' : 'multiple'
}

export const countSolutions = (board: Board, limit = 2): SolutionCount =>
  countSolutionsOfValues(valuesOf(board), limit)

export const hasUniqueSolution = (board: Board): boolean => countSolutions(board) === 'unique'
