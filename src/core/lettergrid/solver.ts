import { applyAction, isFinished, scoreOf, type LettergridState, type PlayRecord } from './game'
import { evaluatePlay } from './evaluate'
import { cellIndex, colOf, GRID_SIZE, rowOf, runOf, type Cell, type Direction, type PlacedTile } from './grid'
import { letterValuesFor } from './letterValuesTable'
import type { WordList } from './wordList'

export interface BestPlay {
  tiles: PlacedTile[]
  score: number
}

const A = 97

/** Lowest index in [lo, hi) whose letter at `depth` is >= `code` (words shorter than depth sort first). */
function lowerBound(words: readonly string[], lo: number, hi: number, depth: number, code: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const c = words[mid].length > depth ? words[mid].charCodeAt(depth) : -1
    if (c < code) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The highest-scoring legal Play for the current Rack, or null if there is none. Ties go to the
 * first found in a fixed order (across then down, by line, start cell, then letter), so the answer
 * is deterministic. Walks the sorted Word List by prefix instead of building a trie.
 */
export function bestPlay(state: LettergridState, words: WordList): BestPlay | null {
  const list = words.words
  const grid = state.grid
  const values = letterValuesFor(state.wordListVersion)
  const isWord = (w: string) => words.isWord(w)
  const filled = (i: number) => grid[i] !== null

  const rackCounts = new Array<number>(26).fill(0)
  for (const l of state.rack) rackCounts[l.charCodeAt(0) - A]++

  // crossOk[dir][cell * 26 + letter]: the word crossing `cell` against `dir` is fine with `letter` there.
  const crossOk: Record<Direction, Uint8Array> = {
    across: new Uint8Array(GRID_SIZE * GRID_SIZE * 26),
    down: new Uint8Array(GRID_SIZE * GRID_SIZE * 26),
  }
  for (const dir of ['across', 'down'] as Direction[]) {
    const perp: Direction = dir === 'across' ? 'down' : 'across'
    for (let i = 0; i < grid.length; i++) {
      if (filled(i)) continue
      for (let l = 0; l < 26; l++) {
        if (rackCounts[l] === 0) continue
        const letter = String.fromCharCode(A + l)
        const at = (j: number): Cell => (j === i ? letter : grid[j])
        const run = runOf(at, i, perp)
        crossOk[dir][i * 26 + l] = run.length < 2 || isWord(run.map(at).join('')) ? 1 : 0
      }
    }
  }

  let best: BestPlay | null = null
  const placed: { idx: number; l: number }[] = []

  for (const dir of ['across', 'down'] as Direction[]) {
    for (let line = 0; line < GRID_SIZE; line++) {
      const cells = Array.from({ length: GRID_SIZE }, (_, k) =>
        dir === 'across' ? cellIndex(line, k) : cellIndex(k, line),
      )
      const anchored = cells.some(
        (i) =>
          filled(i) ||
          (rowOf(i) > 0 && filled(i - GRID_SIZE)) ||
          (rowOf(i) < GRID_SIZE - 1 && filled(i + GRID_SIZE)) ||
          (colOf(i) > 0 && filled(i - 1)) ||
          (colOf(i) < GRID_SIZE - 1 && filled(i + 1)),
      )
      if (!anchored) continue

      const walk = (pos: number, lo: number, hi: number, depth: number): void => {
        const open = pos === GRID_SIZE || !filled(cells[pos])
        if (open && depth >= 2 && placed.length > 0 && list[lo].length === depth) {
          const tiles = placed.map(({ idx, l }) => ({
            row: rowOf(idx),
            col: colOf(idx),
            letter: String.fromCharCode(A + l),
          }))
          const ev = evaluatePlay(grid, state.bonuses, tiles, values, isWord)
          if (ev.ok && (best === null || ev.score > best.score)) best = { tiles, score: ev.score }
        }
        if (pos === GRID_SIZE) return
        const idx = cells[pos]
        const letters = filled(idx) ? [(grid[idx] as string).charCodeAt(0) - A] : [...Array(26).keys()]
        for (const l of letters) {
          const isNew = !filled(idx)
          if (isNew && (rackCounts[l] === 0 || crossOk[dir][idx * 26 + l] === 0)) continue
          const a = lowerBound(list, lo, hi, depth, A + l)
          const b = lowerBound(list, a, hi, depth, A + l + 1)
          if (a === b) continue
          if (isNew) {
            rackCounts[l]--
            placed.push({ idx, l })
          }
          walk(pos + 1, a, b, depth + 1)
          if (isNew) {
            placed.pop()
            rackCounts[l]++
          }
        }
      }

      for (let s = 0; s < GRID_SIZE; s++) {
        if (s > 0 && filled(cells[s - 1])) continue
        walk(s, 0, list.length, 0)
      }
    }
  }
  return best
}

export interface GreedyResult {
  score: number
  plays: PlayRecord[]
}

/**
 * Deterministic greedy solver (Par solver v1): each Play is the best-scoring legal Play for the
 * Rack, or a Swap when none exists, until all Plays are made.
 */
export function solveGreedy(start: LettergridState, words: WordList): GreedyResult {
  let state = start
  while (!isFinished(state)) {
    const play = bestPlay(state, words)
    const result = applyAction(state, play ? { type: 'play', tiles: play.tiles } : { type: 'swap' }, words)
    if (!result.ok) throw new Error(`Greedy solver made an illegal action: ${result.reason}`)
    state = result.state
  }
  return { score: scoreOf(state), plays: state.plays }
}
