import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Game, displayName, type GameSession, type MoveFeedback, type Position } from '../core'
import { useApp } from '../app/AppContext'
import { playHaptics } from '../platform/haptics'
import { Board } from './Board'
import { ControlBar, NumberPad } from './Controls'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { WinOverlay } from './WinOverlay'
import { accessibleElapsed, formatElapsed } from './format'

const FLASH_MS = 600

/** Counts whole seconds of wall-clock time while the Game is playing, so timer throttling cannot lose time. */
function useGameClock(session: GameSession, running: boolean) {
  // Milliseconds already elapsed toward the next second, carried across pauses so none are dropped.
  const carryMs = useRef(0)
  useEffect(() => {
    if (!running) return
    let last = performance.now() - carryMs.current
    const id = setInterval(() => {
      const now = performance.now()
      while (now - last >= 1000) {
        session.tick()
        last += 1000
      }
    }, 250)
    return () => {
      clearInterval(id)
      carryMs.current = Math.min(999, Math.max(0, performance.now() - last))
    }
  }, [session, running])
}

/** Pauses and saves whenever the page is hidden or going away. */
function useAutoPause(session: GameSession) {
  useEffect(() => {
    const away = () => {
      session.pause()
      session.save()
    }
    const onVisibility = () => document.visibilityState === 'hidden' && away()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', away)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', away)
    }
  }, [session])
}

export function GameScreen({ session }: { session: GameSession }) {
  const { controller, sheet } = useApp()
  useSyncExternalStore(session.subscribe, session.getVersion)
  const state = session.state
  const [flashMistake, setFlashMistake] = useState<Position | null>(null)
  const [flashCompleted, setFlashCompleted] = useState<ReadonlySet<Position>>(new Set())
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const requestNewGame = () => {
    if (session.dailyDay !== null && controller.profile.savedGame() !== null) setConfirmAbandon(true)
    else controller.openSheet('picker')
  }
  const timers = useRef<number[]>([])
  const boardRef = useRef<HTMLDivElement>(null)

  useGameClock(session, state.status === 'playing')
  useAutoPause(session)
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const show = useCallback((fb: MoveFeedback) => {
    playHaptics(fb.haptics)
    if (fb.mistakeAt !== null) {
      const p = fb.mistakeAt
      setFlashMistake(p)
      timers.current.push(window.setTimeout(() => setFlashMistake((cur) => (cur === p ? null : cur)), FLASH_MS))
    }
    if (fb.completedUnits.size > 0) {
      const cells = fb.completedUnits
      setFlashCompleted(cells)
      timers.current.push(window.setTimeout(() => setFlashCompleted((cur) => (cur === cells ? new Set() : cur)), FLASH_MS))
    }
  }, [])

  const select = useCallback((p: Position) => session.select(p), [session])
  const focusCell = (p: Position) => boardRef.current?.querySelector<HTMLElement>(`[data-p="${p}"]`)?.focus()

  const playing = state.status === 'playing'
  const won = state.status === 'won'
  const blocked = sheet !== null || won

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blocked || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const key = e.key
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z') {
        e.preventDefault()
        if (playing) show(session.undo())
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (key.toLowerCase() === 'p' || key === 'Escape') {
        if (state.status === 'playing') session.pause()
        else session.resume()
        return
      }
      if (!playing) return
      if (/^[1-9]$/.test(key)) {
        e.preventDefault()
        show(session.tapNumber(Number(key)))
      } else if (key === 'Backspace' || key === 'Delete' || key === '0') {
        e.preventDefault()
        show(session.erase())
      } else if (key.toLowerCase() === 'n') {
        show(session.toggleNotesMode())
      } else if (key.toLowerCase() === 'z') {
        show(session.undo())
      } else {
        const moves: Record<string, [number, number]> = {
          ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
          k: [-1, 0], j: [1, 0], h: [0, -1], l: [0, 1],
        }
        const m = moves[key]
        if (!m) return
        e.preventDefault()
        const cur = state.selected ?? 0
        const row = Math.min(8, Math.max(0, Math.floor(cur / 9) + m[0]))
        const col = Math.min(8, Math.max(0, (cur % 9) + m[1]))
        const next = row * 9 + col
        session.select(next)
        focusCell(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, state.status, state.selected, playing, blocked, show])

  const paused = state.status === 'paused'
  const goHome = () => controller.goHome()
  return (
    <main className="game">
      <header className="game-header">
        <button type="button" className="btn-text" onClick={goHome}>
          Home
        </button>
        <span className="game-title">
          {session.dailyDay === null ? displayName(state.difficulty) : `Daily · ${displayName(state.difficulty)}`}
        </span>
        <span className="game-mistakes" aria-label={`Mistakes ${state.mistakes}`}>
          Mistakes: {state.mistakes}
        </span>
        <span className="game-time">
          <span className="tabular" role="timer" aria-label={`Time ${accessibleElapsed(state.elapsedSeconds)}`}>
            {formatElapsed(state.elapsedSeconds)}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={paused ? 'Resume' : 'Pause'}
            disabled={won}
            onClick={() => (paused ? session.resume() : session.pause())}
          >
            <Icon name={paused ? 'play' : 'pause'} fill={paused} />
          </button>
        </span>
      </header>
      <div className="board-slot" ref={boardRef}>
        {paused ? (
          <div className="pause-overlay">
            <h2>Paused</h2>
            <p className="muted tabular">{formatElapsed(state.elapsedSeconds)}</p>
            <button type="button" className="btn btn-primary" onClick={() => session.resume()} autoFocus>
              Resume
            </button>
          </div>
        ) : (
          <Board
            state={state}
            conflicts={Game.conflictsOf(state)}
            flashMistake={flashMistake}
            flashCompleted={flashCompleted}
            onSelect={select}
          />
        )}
      </div>
      <ControlBar
        state={state}
        disabled={!playing}
        onUndo={() => show(session.undo())}
        onErase={() => show(session.erase())}
        onNotes={() => show(session.toggleNotesMode())}
        onHint={() => show(session.hint())}
      />
      <NumberPad state={state} disabled={!playing} onNumber={(n) => show(session.tapNumber(n))} />
      {won && sheet === null && <WinOverlay session={session} onHome={goHome} onNewGame={requestNewGame} />}
      {confirmAbandon && (
        <ConfirmDialog
          title="Abandon current game?"
          message="Your saved game will be lost."
          confirmLabel="Start New"
          onCancel={() => setConfirmAbandon(false)}
          onConfirm={() => {
            setConfirmAbandon(false)
            controller.openSheet('picker')
          }}
        />
      )}
    </main>
  )
}
