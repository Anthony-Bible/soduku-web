import { DIFFICULTIES, clueCount, displayName } from '../core'
import { useApp } from '../app/AppContext'
import { Sheet } from './Sheet'
import { formatElapsed } from './format'

export function DifficultyPicker() {
  const { controller } = useApp()
  const stats = controller.profile.statistics
  return (
    <Sheet title="New Game" onClose={() => controller.openSheet(null)}>
      <ul className="list">
        {DIFFICULTIES.map((d) => {
          const best = stats[d].bestTimeSeconds
          return (
            <li key={d}>
              <button
                type="button"
                className="list-row"
                aria-label={`${displayName(d)}, ${clueCount(d)} clues`}
                onClick={() => controller.startNewGame(d)}
              >
                <span>
                  <strong>{displayName(d)}</strong>
                  <small>{clueCount(d)} clues</small>
                </span>
                {best !== null && <span className="muted tabular">Best {formatElapsed(best)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
