import { ACHIEVEMENTS, GROUPS, unlockedCount } from '../core'
import { useApp } from '../app/AppContext'
import { Icon, groupIcon } from './Icon'
import { Sheet } from './Sheet'

export function AchievementsSheet() {
  const { controller } = useApp()
  const progress = controller.profile.achievements
  return (
    <Sheet title="Achievements" onClose={() => controller.openSheet(null)}>
      <p className="muted">
        {unlockedCount(progress)} of {ACHIEVEMENTS.length} unlocked
      </p>
      {GROUPS.map((g) => (
        <section key={g.id} aria-label={g.title}>
          <h3>{g.title}</h3>
          <ul className="list">
            {ACHIEVEMENTS.filter((a) => a.group === g.id).map((a) => {
              const at = progress.unlockedAt[a.id]
              return (
                <li key={a.id} className={`achievement${at === undefined ? ' locked' : ''}`} aria-label={`${a.title}, ${at === undefined ? 'Locked' : 'Unlocked'}`}>
                  <span className="badge" aria-hidden="true">
                    <Icon name={at === undefined ? 'lock' : groupIcon(a.group)} size={18} />
                  </span>
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.detail}</small>
                    {at !== undefined && <small className="accent">{new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small>}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  )
}
