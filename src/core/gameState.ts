import {
  clearNotes,
  hasNote,
  isFilled,
  setNotes,
  setValue,
  toggleNote as boardToggleNote,
  type Board,
} from './board'
import { maxHints, type Difficulty } from './difficulty'
import type { Puzzle } from './generator'
import { ALL_POSITIONS, PEERS, UNITS, boxOf, colOf, rowOf, type Position } from './position'
import { conflicts as boardConflicts } from './validator'

export type GameStatus = 'playing' | 'paused' | 'won'

export type MoveKind =
  | { kind: 'setValue'; previous: number; next: number; previousNotes: number; clearedPeers?: Position[] }
  | { kind: 'toggleNote'; number: number }
  | { kind: 'clearNotes'; previousNotes: number }

export interface Move {
  readonly position: Position
  readonly move: MoveKind
}

/** One Game in progress or finished. Plain JSON-safe data; every function below returns a new state. */
export interface GameState {
  /** Permanent random id assigned when the Game starts; its Game record in the synced document has the same id. */
  readonly id: string
  readonly board: Board
  readonly solution: Board
  readonly difficulty: Difficulty
  /** Decimal string of the generator seed. */
  readonly seed: string
  /** Mistakes: values entered that differ from the solution. Counted, never fatal. */
  readonly mistakes: number
  readonly hintsUsed: number
  readonly elapsedSeconds: number
  readonly status: GameStatus
  readonly history: readonly Move[]
  readonly selected: Position | null
  readonly isNotesMode: boolean
  /** Epoch milliseconds. */
  readonly startedAt: number
}

export type Outcome = 'ignored' | 'applied' | 'mistake' | 'won'

export interface Result {
  readonly state: GameState
  readonly outcome: Outcome
}

export function newGame(puzzle: Puzzle, startedAt: number, id: string = `game-${startedAt}`): GameState {
  return {
    id,
    board: puzzle.puzzle,
    solution: puzzle.solution,
    difficulty: puzzle.difficulty,
    seed: puzzle.seed,
    mistakes: 0,
    hintsUsed: 0,
    elapsedSeconds: 0,
    status: 'playing',
    history: [],
    selected: null,
    isNotesMode: false,
    startedAt,
  }
}

// MARK: Derived

export const hintsRemaining = (s: GameState): number => Math.max(0, maxHints(s.difficulty) - s.hintsUsed)
export const conflictsOf = (s: GameState): Set<Position> => boardConflicts(s.board)

export const isComplete = (s: GameState): boolean =>
  isFilled(s.board) && ALL_POSITIONS.every((p) => s.board[p].value === s.solution[p].value)

export const countOf = (s: GameState, n: number): number => s.board.filter((c) => c.value === n).length

export const isNumberComplete = (s: GameState, n: number): boolean =>
  ALL_POSITIONS.filter((p) => s.board[p].value === n && s.solution[p].value === n).length >= 9

/** A non-given cell holding a value that differs from the solution. */
export function isWrong(s: GameState, p: Position): boolean {
  const cell = s.board[p]
  return !cell.given && cell.value !== 0 && cell.value !== s.solution[p].value
}

/**
 * Every cell of each row, column and box through `p` that is now fully and correctly filled.
 * Empty if none is. Call after a value lands at `p` to find the units that move completed.
 */
export function completedUnits(s: GameState, p: Position): Set<Position> {
  const result = new Set<Position>()
  const through = [UNITS[rowOf(p)], UNITS[9 + colOf(p)], UNITS[18 + boxOf(p)]]
  for (const unit of through) {
    if (unit.every((q) => s.board[q].value !== 0 && s.board[q].value === s.solution[q].value)) {
      unit.forEach((q) => result.add(q))
    }
  }
  return result
}

// MARK: Mutations

const ignored = (state: GameState): Result => ({ state, outcome: 'ignored' })

function removeNoteFromPeers(board: Board, number: number, p: Position): { board: Board; cleared: Position[] } {
  let next = board
  const cleared: Position[] = []
  for (const q of PEERS[p]) {
    if (next[q].value === 0 && hasNote(next[q], number)) {
      next = boardToggleNote(next, q, number)
      cleared.push(q)
    }
  }
  return { board: next, cleared }
}

export const select = (s: GameState, p: Position | null): GameState => ({ ...s, selected: p })

export function enter(s: GameState, number: number, p: Position): Result {
  if (s.status !== 'playing' || s.board[p].given || number < 1 || number > 9) return ignored(s)
  if (s.isNotesMode) return toggleNote(s, number, p)
  const cell = s.board[p]
  if (cell.value === number) return ignored(s)

  const { board, cleared } = removeNoteFromPeers(setValue(s.board, p, number), number, p)
  const history: Move[] = [
    ...s.history,
    { position: p, move: { kind: 'setValue', previous: cell.value, next: number, previousNotes: cell.notes, clearedPeers: cleared } },
  ]
  const next: GameState = { ...s, board, history }
  if (number !== s.solution[p].value) return { state: { ...next, mistakes: s.mistakes + 1 }, outcome: 'mistake' }
  if (isComplete(next)) return { state: { ...next, status: 'won' }, outcome: 'won' }
  return { state: next, outcome: 'applied' }
}

export function erase(s: GameState, p: Position): Result {
  if (s.status !== 'playing' || s.board[p].given) return ignored(s)
  const cell = s.board[p]
  if (cell.value !== 0) {
    const move: Move = { position: p, move: { kind: 'setValue', previous: cell.value, next: 0, previousNotes: cell.notes } }
    return { state: { ...s, board: setValue(s.board, p, 0), history: [...s.history, move] }, outcome: 'applied' }
  }
  if (cell.notes !== 0) {
    const move: Move = { position: p, move: { kind: 'clearNotes', previousNotes: cell.notes } }
    return { state: { ...s, board: clearNotes(s.board, p), history: [...s.history, move] }, outcome: 'applied' }
  }
  return ignored(s)
}

export function toggleNote(s: GameState, number: number, p: Position): Result {
  if (s.status !== 'playing' || number < 1 || number > 9) return ignored(s)
  const cell = s.board[p]
  if (cell.given || cell.value !== 0) return ignored(s)
  const move: Move = { position: p, move: { kind: 'toggleNote', number } }
  return { state: { ...s, board: boardToggleNote(s.board, p, number), history: [...s.history, move] }, outcome: 'applied' }
}

export function undo(s: GameState): Result {
  if (s.status !== 'playing' || s.history.length === 0) return ignored(s)
  const last = s.history[s.history.length - 1]
  const history = s.history.slice(0, -1)
  const p = last.position
  let board = s.board
  const m = last.move
  switch (m.kind) {
    case 'setValue':
      board = setNotes(setValue(board, p, m.previous), p, m.previousNotes)
      for (const q of m.clearedPeers ?? []) board = boardToggleNote(board, q, m.next)
      break
    case 'toggleNote':
      board = boardToggleNote(board, p, m.number)
      break
    case 'clearNotes':
      board = setNotes(board, p, m.previousNotes)
      break
  }
  return { state: { ...s, board, history, selected: p }, outcome: 'applied' }
}

/** Fills one cell with its answer: the selected cell if empty or wrong, else the first empty cell, else the first wrong one. */
export function hint(s: GameState): Result {
  if (s.status !== 'playing' || hintsRemaining(s) <= 0) return ignored(s)
  let target: Position | undefined
  const sel = s.selected
  if (sel !== null && !s.board[sel].given && (s.board[sel].value === 0 || isWrong(s, sel))) target = sel
  else target = ALL_POSITIONS.find((p) => s.board[p].value === 0) ?? ALL_POSITIONS.find((p) => isWrong(s, p))
  if (target === undefined) return ignored(s)
  const answer = s.solution[target].value
  const cell = s.board[target]
  const { board: hinted, cleared } = removeNoteFromPeers(setValue(s.board, target, answer), answer, target)
  const move: Move = {
    position: target,
    move: { kind: 'setValue', previous: cell.value, next: answer, previousNotes: cell.notes, clearedPeers: cleared },
  }
  const next: GameState = {
    ...s,
    board: hinted,
    history: [...s.history, move],
    hintsUsed: s.hintsUsed + 1,
    selected: target,
  }
  if (isComplete(next)) return { state: { ...next, status: 'won' }, outcome: 'won' }
  return { state: next, outcome: 'applied' }
}

export const pause = (s: GameState): GameState => (s.status === 'playing' ? { ...s, status: 'paused' } : s)
export const resume = (s: GameState): GameState => (s.status === 'paused' ? { ...s, status: 'playing' } : s)
export const addElapsed = (s: GameState, seconds: number): GameState =>
  s.status === 'playing' && seconds > 0 ? { ...s, elapsedSeconds: s.elapsedSeconds + seconds } : s
export const toggleNotesMode = (s: GameState): GameState => ({ ...s, isNotesMode: !s.isNotesMode })
