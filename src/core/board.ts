import { ALL_POSITIONS, PEERS, type Position } from './position'

/**
 * One square. `value` is 0 when empty. `notes` is a bitmask: bit (n-1) set means pencil mark n.
 * Plain data so a Board round-trips through JSON.
 */
export interface Cell {
  readonly value: number
  readonly given: boolean
  readonly notes: number
}

export type Board = readonly Cell[]

export const EMPTY_CELL: Cell = { value: 0, given: false, notes: 0 }

export const noteBit = (n: number): number => 1 << (n - 1)
export const hasNote = (cell: Cell, n: number): boolean => (cell.notes & noteBit(n)) !== 0
export const notesOf = (cell: Cell): number[] => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => hasNote(cell, n))

export function emptyBoard(): Board {
  return Array.from({ length: 81 }, () => EMPTY_CELL)
}

/** 81 ints, 0 = empty. Non-zero values become givens. */
export function boardFromValues(values: readonly number[]): Board {
  if (values.length !== 81) throw new Error('A board needs exactly 81 values')
  return values.map((v) => (v >= 1 && v <= 9 ? { value: v, given: true, notes: 0 } : EMPTY_CELL))
}

/** 81 characters of 0-9 or '.', whitespace ignored. Returns null if invalid. */
export function boardFromString(text: string): Board | null {
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length !== 81) return null
  const values: number[] = []
  for (const ch of chars) {
    if (ch === '.') values.push(0)
    else if (ch >= '0' && ch <= '9') values.push(ch.charCodeAt(0) - 48)
    else return null
  }
  return boardFromValues(values)
}

export const serialize = (board: Board): string => board.map((c) => String(c.value)).join('')
export const valuesOf = (board: Board): number[] => board.map((c) => c.value)

function withCell(board: Board, p: Position, cell: Cell): Board {
  const next = board.slice()
  next[p] = cell
  return next
}

/** Sets (or clears with 0) the value. A non-zero value also clears the cell's notes. */
export function setValue(board: Board, p: Position, value: number): Board {
  const cell = board[p]
  return withCell(board, p, { ...cell, value, notes: value !== 0 ? 0 : cell.notes })
}

export function toggleNote(board: Board, p: Position, n: number): Board {
  if (n < 1 || n > 9) return board
  return withCell(board, p, { ...board[p], notes: board[p].notes ^ noteBit(n) })
}

export const setNotes = (board: Board, p: Position, notes: number): Board =>
  withCell(board, p, { ...board[p], notes })

export const clearNotes = (board: Board, p: Position): Board => setNotes(board, p, 0)

export const isFilled = (board: Board): boolean => board.every((c) => c.value !== 0)
export const emptyPositions = (board: Board): Position[] => ALL_POSITIONS.filter((p) => board[p].value === 0)

/** Digits not used by any peer of `p`; empty for a filled cell. */
export function candidates(board: Board, p: Position): number[] {
  if (board[p].value !== 0) return []
  const used = new Set(PEERS[p].map((q) => board[q].value))
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n))
}
