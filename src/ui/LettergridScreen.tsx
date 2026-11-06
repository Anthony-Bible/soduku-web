import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shortTitle } from '../core'
import { useApp } from '../app/AppContext'
import type { LettergridSession } from '../app/lettergridSession'
import {
  CENTRE,
  GRID_SIZE,
  PLAYS_PER_DAILY,
  cellIndex,
  colOf,
  letterValuesFor,
  rowOf,
  starsFor,
  type ActionResult,
  type Bonus,
  type Direction,
} from '../core/lettergrid'
import { playHaptics } from '../platform/haptics'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { LettergridFinish } from './LettergridFinish'
import { starsText, starsWords } from './format'

const BONUS_TEXT: Record<Exclude<Bonus, null>, { short: string; words: string }> = {
  L2: { short: 'L×2', words: 'double letter' },
  L3: { short: 'L×3', words: 'triple letter' },
  W2: { short: 'W×2', words: 'double word' },
  W3: { short: 'W×3', words: 'triple word' },
}

/** Why a Play was refused, in the player's words. Nothing was placed. */
function rejectionText(r: Extract<ActionResult, { ok: false }>): string {
  switch (r.reason) {
    case 'empty':
      return 'Place at least one tile first.'
    case 'too-many-tiles':
    case 'not-in-rack':
      return 'You can only play the tiles in your Rack.'
    case 'off-grid':
    case 'bad-letter':
      return 'That placement does not fit on the grid.'
    case 'occupied':
    case 'duplicate-cell':
      return 'A square is already taken.'
    case 'not-in-line':
      return 'Tiles must all go in one row or one column.'
    case 'gap':
      return 'Tiles must sit side by side, with no gaps.'
    case 'not-connected':
      return 'Tiles must connect to a word already on the grid.'
    case 'not-a-word':
      return r.word ? `“${r.word.toUpperCase()}” is not in the Word List.` : 'That is not in the Word List.'
    case 'finished':
      return 'All Plays are used.'
    default:
      return 'That Play was not accepted.'
  }
}

interface Staged {
  cell: number
  rack: number
}

interface CellProps {
  cell: number
  letter: string | null
  value: number
  bonus: Bonus
  seed: boolean
  staged: boolean
  cursor: boolean
  tabbable: boolean
  onTap: (cell: number) => void
  onFocusCell: (cell: number) => void
}

function cellLabel({ cell, letter, value, bonus, seed, staged }: CellProps): string {
  const where = `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`
  if (letter === null) return bonus ? `${where}, empty, ${BONUS_TEXT[bonus].words}` : `${where}, empty`
  const points = `${value} ${value === 1 ? 'point' : 'points'}`
  return `${where}, ${letter.toUpperCase()}, ${points}, ${staged ? 'placed this Play, tap to take back' : seed ? 'seed word' : 'played'}`
}

function CellView(props: CellProps) {
  const { cell, letter, value, bonus, seed, staged, cursor, tabbable, onTap, onFocusCell } = props
  const classes = ['lg-cell']
  if (bonus) classes.push(`bonus-${bonus}`)
  if (letter !== null) classes.push('tile')
  if (seed) classes.push('seed')
  if (staged) classes.push('staged')
  if (cursor) classes.push('cursor')
  return (
    <button type="button" className={classes.join(' ')} data-p={cell} tabIndex={tabbable ? 0 : -1} aria-label={cellLabel(props)} onFocus={() => onFocusCell(cell)} onClick={() => onTap(cell)}>
      {letter !== null ? (
        <>
          <span className="lg-letter" aria-hidden="true">{letter.toUpperCase()}</span>
          <span className="lg-value" aria-hidden="true">{value}</span>
        </>
      ) : bonus ? (
        <span className="lg-bonus" aria-hidden="true">{BONUS_TEXT[bonus].short}</span>
      ) : null}
    </button>
  )
}

function Loading({ error, onRetry, onHome }: { error: string | null; onRetry: () => void; onHome: () => void }) {
  return (
    <main className="game">
      <header className="lg-header">
        <button type="button" className="btn-text" onClick={onHome}>Home</button>
        <span className="game-title">Lettergrid</span>
      </header>
      <div className="lg-loading">
        {error ? (
          <>
            <p role="alert" className="form-error">{error}</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
          </>
        ) : (
          <p role="status" className="muted">Loading the Word List…</p>
        )}
      </div>
    </main>
  )
}

function Game({ session }: { session: LettergridSession }) {
  const { controller, sheet } = useApp()
  const state = session.state
  const values = useMemo(() => letterValuesFor(state.wordListVersion), [state.wordListVersion])
  const [staged, setStaged] = useState<Staged[]>([])
  const [selectedRack, setSelectedRack] = useState<number | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [dir, setDir] = useState<Direction>('across')
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)
  const [confirmSwap, setConfirmSwap] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const result = session.result
  const finished = result !== null
  const playsLeft = PLAYS_PER_DAILY - state.plays.length
  const blocked = sheet !== null || confirmSwap || finished

  const stagedAt = useMemo(() => new Map(staged.map((s) => [s.cell, s.rack])), [staged])
  const stagedRack = useMemo(() => new Set(staged.map((s) => s.rack)), [staged])
  const letterAt = (cell: number): string | null => {
    const r = stagedAt.get(cell)
    return r !== undefined ? state.rack[r] : state.grid[cell]
  }
  // Two or more tiles already in a line fix the direction typing carries on in.
  const playDir: Direction =
    staged.length >= 2 && staged.every((s) => colOf(s.cell) === colOf(staged[0].cell)) ? 'down'
    : staged.length >= 2 && staged.every((s) => rowOf(s.cell) === rowOf(staged[0].cell)) ? 'across'
    : dir

  const next = (cell: number, d: Direction): number | null =>
    d === 'across' ? (colOf(cell) < GRID_SIZE - 1 ? cell + 1 : null) : rowOf(cell) < GRID_SIZE - 1 ? cell + GRID_SIZE : null
  const focusCell = (cell: number) => boardRef.current?.querySelector<HTMLElement>(`[data-p="${cell}"]`)?.focus()
  const say = (text: string, bad = false) => setMessage({ text, bad })

  const put = (rack: number, cell: number) => {
    setStaged((s) => [...s.filter((x) => x.rack !== rack && x.cell !== cell), { cell, rack }])
    setMessage(null)
  }
  const recall = (cell: number) => {
    setStaged((s) => s.filter((x) => x.cell !== cell))
    setMessage(null)
  }
  const recallAll = () => {
    setStaged([])
    setSelectedRack(null)
    setMessage(null)
  }

  const tapCell = (cell: number) => {
    setCursor(cell)
    if (stagedAt.has(cell)) return recall(cell)
    if (state.grid[cell] !== null) return
    if (selectedRack !== null) {
      put(selectedRack, cell)
      setSelectedRack(null)
    }
  }
  const tapRack = (i: number) => {
    if (stagedRack.has(i)) {
      const at = staged.find((s) => s.rack === i)
      if (at) recall(at.cell)
      return
    }
    if (cursor !== null && state.grid[cursor] === null && !stagedAt.has(cursor)) {
      put(i, cursor)
      setSelectedRack(null)
      const n = next(cursor, playDir)
      if (n !== null) setCursor(n)
      return
    }
    setSelectedRack(selectedRack === i ? null : i)
  }

  const typeLetter = (letter: string) => {
    const rack = state.rack.findIndex((l, i) => l === letter && !stagedRack.has(i))
    if (rack < 0) return say(`No ${letter.toUpperCase()} left in your Rack.`, true)
    if (cursor === null) return say('Select a square first.', true)
    let at: number | null = cursor
    while (at !== null && (state.grid[at] !== null || stagedAt.has(at))) at = next(at, playDir)
    if (at === null) return say('No room to place that tile here.', true)
    put(rack, at)
    const n = next(at, playDir)
    setCursor(n ?? at)
    if (n !== null) focusCell(n)
  }

  const submit = () => {
    if (staged.length === 0 || finished) return
    const r = session.submit(staged.map((s) => ({ row: rowOf(s.cell), col: colOf(s.cell), letter: state.rack[s.rack] })))
    if (!r.ok) {
      playHaptics(['error'])
      say(rejectionText(r), true)
      return
    }
    playHaptics(['success'])
    setStaged([])
    setSelectedRack(null)
    say(`Play scored ${r.score}.`)
  }
  const swap = () => {
    setConfirmSwap(false)
    const r = session.swap()
    if (!r.ok) return say(rejectionText(r), true)
    setStaged([])
    setSelectedRack(null)
    say('Swapped your Rack.')
  }

  const submitRef = useRef(submit)
  const typeRef = useRef(typeLetter)
  useEffect(() => {
    submitRef.current = submit
    typeRef.current = typeLetter
  })
  const moveCursor = useCallback((d: Direction, delta: number) => {
    setCursor((cur) => {
      const from = cur ?? cellIndex(CENTRE, CENTRE)
      const row = Math.min(GRID_SIZE - 1, Math.max(0, rowOf(from) + (d === 'down' ? delta : 0)))
      const col = Math.min(GRID_SIZE - 1, Math.max(0, colOf(from) + (d === 'across' ? delta : 0)))
      const to = cellIndex(row, col)
      focusCell(to)
      return to
    })
    setDir(d)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blocked || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const key = e.key
      const arrows: Record<string, [Direction, number]> = {
        ArrowUp: ['down', -1], ArrowDown: ['down', 1], ArrowLeft: ['across', -1], ArrowRight: ['across', 1],
      }
      if (arrows[key]) {
        e.preventDefault()
        moveCursor(...arrows[key])
      } else if (/^[a-zA-Z]$/.test(key)) {
        // Enter on a focused button is a click; letters never are.
        e.preventDefault()
        typeRef.current(key.toLowerCase())
      } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault()
        setStaged((s) => {
          const at = s.findIndex((x) => x.cell === cursor)
          const drop = at >= 0 ? at : s.length - 1
          return drop < 0 ? s : s.filter((_, i) => i !== drop)
        })
        setMessage(null)
      } else if (key === 'Enter' && !(target && target.tagName === 'BUTTON' && !target.hasAttribute('data-p'))) {
        e.preventDefault()
        submitRef.current()
      } else if (key === 'Escape') {
        recallAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocked, cursor, moveCursor])

  const score = session.score
  const stars = starsFor(score, state.par)
  const tabbable = cursor ?? cellIndex(CENTRE, CENTRE)
  return (
    <main className="game lg-game">
      <header className="lg-header">
        <button type="button" className="btn-text" onClick={() => controller.goHome()}>Home</button>
        <span className="game-title">Lettergrid · {shortTitle(session.day)}</span>
        <span className="game-mistakes">
          <span aria-hidden="true">Plays left: <strong className="tabular">{playsLeft}</strong></span>
          <span className="sr-only">{`${playsLeft} of ${PLAYS_PER_DAILY} Plays remaining`}</span>
        </span>
      </header>
      <div className="lg-scoreboard">
        <span className="lg-score tabular"><span aria-hidden="true">Score <strong>{score}</strong></span><span className="sr-only">{`Score ${score}`}</span></span>
        <ul className="lg-par" aria-label="Par">
          {state.par.tiers.map((t, i) => (
            <li key={i} className={score >= t ? 'reached' : ''} aria-label={`Par ${starsWords(i + 1)}: ${t} points${score >= t ? ', reached' : ''}`}>
              <span aria-hidden="true">{starsText(i + 1)}</span> <span className="tabular" aria-hidden="true">{t}</span>
            </li>
          ))}
        </ul>
        <span className="sr-only" role="status">{stars > 0 ? `${starsWords(stars)} so far` : ''}</span>
      </div>
      <div className="board-slot" ref={boardRef}>
        <div className="lg-board" role="group" aria-label="Lettergrid board">
          {state.grid.map((_, cell) => {
            const letter = letterAt(cell)
            return (
              <CellView
                key={cell}
                cell={cell}
                letter={letter}
                value={letter ? values[letter] ?? 0 : 0}
                bonus={state.bonuses[cell]}
                seed={state.seedCells.includes(cell)}
                staged={stagedAt.has(cell)}
                cursor={cursor === cell}
                tabbable={tabbable === cell}
                onTap={tapCell}
                onFocusCell={setCursor}
              />
            )
          })}
        </div>
      </div>
      <p className="lg-message" role="status">{message && !message.bad ? message.text : ''}</p>
      <p className="lg-message form-error" role="alert">{message?.bad ? message.text : ''}</p>
      <div className="rack" role="group" aria-label="Rack">
        {state.rack.map((letter, i) => {
          const used = stagedRack.has(i)
          return (
            <button
              key={i}
              type="button"
              className={`rack-tile${used ? ' used' : ''}${selectedRack === i ? ' selected' : ''}`}
              aria-label={used ? `Rack tile ${letter.toUpperCase()}, on the grid, tap to take back` : `Rack tile ${letter.toUpperCase()}, ${values[letter]} ${values[letter] === 1 ? 'point' : 'points'}`}
              aria-pressed={used ? undefined : selectedRack === i}
              disabled={finished}
              onClick={() => tapRack(i)}
            >
              <span className="lg-letter" aria-hidden="true">{letter.toUpperCase()}</span>
              <span className="lg-value" aria-hidden="true">{values[letter]}</span>
            </button>
          )
        })}
      </div>
      <div className="row-buttons lg-actions">
        <button type="button" className="btn" disabled={staged.length === 0 || finished} onClick={recallAll}>
          <Icon name="undo" size={18} /> Recall
        </button>
        <button type="button" className="btn" disabled={finished} onClick={() => setConfirmSwap(true)}>
          Swap
        </button>
        <button type="button" className="btn btn-primary grow" disabled={staged.length === 0 || finished} onClick={submit}>
          Submit Play
        </button>
      </div>
      {confirmSwap && (
        <ConfirmDialog
          title="Swap your Rack?"
          message="The whole Rack goes to the back of the Tile Run and you draw new tiles. This uses a Play."
          confirmLabel="Swap"
          onCancel={() => setConfirmSwap(false)}
          onConfirm={swap}
        />
      )}
      {result && sheet === null && <LettergridFinish session={session} result={result} onHome={() => controller.goHome()} />}
    </main>
  )
}

/** The Lettergrid game: loading the Word List, a load that failed, or the Daily itself. */
export function LettergridScreen() {
  const { controller, lettergrid, lettergridOpening } = useApp()
  if (lettergrid) return <Game key={lettergrid.gameId} session={lettergrid} />
  return (
    <Loading
      error={lettergridOpening?.error ?? null}
      onRetry={() => controller.retryLettergridOpening()}
      onHome={() => controller.goHome()}
    />
  )
}
