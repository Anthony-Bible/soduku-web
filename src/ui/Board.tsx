import { memo } from 'react'
import { Game, colOf, hasNote, rowOf, sharesUnit, type Cell, type GameState, type Position } from '../core'

function cellLabel(cell: Cell, p: Position, wrong: boolean): string {
  const where = `Row ${rowOf(p) + 1}, column ${colOf(p) + 1}`
  if (cell.value !== 0) return `${where}, ${cell.value}, ${cell.given ? 'given' : wrong ? 'wrong' : 'entered'}`
  const notes = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => hasNote(cell, n))
  return notes.length > 0 ? `${where}, empty, notes ${notes.join(' ')}` : `${where}, empty`
}

interface CellProps {
  cell: Cell
  p: Position
  selected: boolean
  peer: boolean
  same: boolean
  conflict: boolean
  wrong: boolean
  flashing: boolean
  completing: boolean
  tabbable: boolean
  onSelect: (p: Position) => void
}

const CellView = memo(function CellView({ cell, p, selected, peer, same, conflict, wrong, flashing, completing, tabbable, onSelect }: CellProps) {
  const classes = ['cell']
  if (colOf(p) % 3 === 0 && colOf(p) !== 0) classes.push('box-left')
  if (rowOf(p) % 3 === 0 && rowOf(p) !== 0) classes.push('box-top')
  if (flashing) classes.push('flash')
  else if (completing) classes.push('completing')
  else if (selected) classes.push('selected')
  else if (conflict) classes.push('conflict')
  else if (same) classes.push('same')
  else if (peer) classes.push('peer')
  if (cell.given) classes.push('given')
  else if (wrong) classes.push('wrong')
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-p={p}
      tabIndex={tabbable ? 0 : -1}
      aria-label={cellLabel(cell, p, wrong)}
      aria-pressed={selected}
      onClick={() => onSelect(p)}
    >
      {cell.value !== 0 ? (
        <span className="value">{cell.value}</span>
      ) : cell.notes !== 0 ? (
        <span className="notes" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <span key={n}>{hasNote(cell, n) ? n : ''}</span>
          ))}
        </span>
      ) : null}
    </button>
  )
})

export function Board({
  state,
  conflicts,
  flashMistake,
  flashCompleted,
  onSelect,
}: {
  state: GameState
  conflicts: ReadonlySet<Position>
  flashMistake: Position | null
  flashCompleted: ReadonlySet<Position>
  onSelect: (p: Position) => void
}) {
  const sel = state.selected
  const selValue = sel === null ? 0 : state.board[sel].value
  return (
    <div className="board" role="group" aria-label="Sudoku board">
      {state.board.map((cell, p) => (
        <CellView
          key={p}
          cell={cell}
          p={p}
          selected={sel === p}
          peer={sel !== null && sharesUnit(sel, p)}
          same={selValue !== 0 && cell.value === selValue}
          conflict={conflicts.has(p)}
          wrong={Game.isWrong(state, p)}
          flashing={flashMistake === p}
          completing={flashCompleted.has(p)}
          tabbable={(sel ?? 0) === p}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

