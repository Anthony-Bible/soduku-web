import { isFilled, type Board } from './board'
import { PEERS, UNITS, type Position } from './position'

/** Positions whose value duplicates another value in the same row, column or box. */
export function conflicts(board: Board): Set<Position> {
  const result = new Set<Position>()
  for (const unit of UNITS) {
    const seen = new Map<number, Position[]>()
    for (const p of unit) {
      const v = board[p].value
      if (v !== 0) seen.set(v, [...(seen.get(v) ?? []), p])
    }
    for (const group of seen.values()) if (group.length > 1) group.forEach((p) => result.add(p))
  }
  return result
}

export function isValidPlacement(board: Board, p: Position, value: number): boolean {
  return PEERS[p].every((q) => board[q].value !== value)
}

export const isConsistent = (board: Board): boolean => conflicts(board).size === 0
export const isSolved = (board: Board): boolean => isFilled(board) && isConsistent(board)
