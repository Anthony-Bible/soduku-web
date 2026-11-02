import { Game, type GameState } from '../core'
import { Icon, type IconName } from './Icon'

function Control({ icon, title, onClick, disabled, active, badge, value }: {
  icon: IconName; title: string; onClick: () => void; disabled?: boolean; active?: boolean; badge?: string; value?: string
}) {
  return (
    <button
      type="button"
      className={`control${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={value ? `${title}, ${value}` : title}
      aria-pressed={active === undefined ? undefined : active}
    >
      <span className="control-icon">
        <Icon name={icon} />
        {badge !== undefined && <span className="control-badge">{badge}</span>}
      </span>
      <span className="control-label" aria-hidden="true">{title}</span>
    </button>
  )
}

export function ControlBar({ state, disabled, onUndo, onErase, onNotes, onHint }: {
  state: GameState; disabled: boolean; onUndo: () => void; onErase: () => void; onNotes: () => void; onHint: () => void
}) {
  const hints = Game.hintsRemaining(state)
  return (
    <div className="controls">
      <Control icon="undo" title="Undo" onClick={onUndo} disabled={disabled || state.history.length === 0} />
      <Control icon="eraser" title="Erase" onClick={onErase} disabled={disabled} />
      <Control icon="pencil" title="Notes" onClick={onNotes} disabled={disabled} active={state.isNotesMode} value={state.isNotesMode ? 'on' : 'off'} />
      <Control icon="bulb" title="Hint" onClick={onHint} disabled={disabled || hints === 0} badge={String(hints)} value={`${hints} remaining`} />
    </div>
  )
}

export function NumberPad({ state, disabled, onNumber }: { state: GameState; disabled: boolean; onNumber: (n: number) => void }) {
  return (
    <div className="numpad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const complete = Game.isNumberComplete(state, n)
        return (
          <button
            key={n}
            type="button"
            className={`key${state.isNotesMode ? ' notes-mode' : ''}`}
            disabled={disabled || complete}
            aria-label={state.isNotesMode ? `Toggle note ${n}` : `Enter ${n}`}
            onClick={() => onNumber(n)}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}
