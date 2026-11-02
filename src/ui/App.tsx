import { useState } from 'react'
import { useBackNavigation } from '../app/useBackNavigation'
import { useApp } from '../app/AppContext'
import { AccountSheet } from './AccountSheet'
import { AchievementsSheet } from './Achievements'
import { CalendarSheet } from './CalendarSheet'
import { DifficultyPicker } from './DifficultyPicker'
import { GameScreen } from './GameScreen'
import { Home } from './Home'
import { StatsSheet } from './Stats'

export function App() {
  const { session, sheet, controller } = useApp()
  // Home's abandon dialog counts as a navigation level so Back closes it instead of leaving the app.
  const [homeDialog, setHomeDialog] = useState(false)
  useBackNavigation(controller, (session ? 1 : 0) + (sheet ? 1 : 0) + (!session && homeDialog ? 1 : 0))
  return (
    <>
      {session ? <GameScreen key={session.state.startedAt + session.state.seed} session={session} /> : <Home onDialogChange={setHomeDialog} />}
      {sheet === 'picker' && <DifficultyPicker />}
      {sheet === 'stats' && <StatsSheet />}
      {sheet === 'achievements' && <AchievementsSheet />}
      {sheet === 'calendar' && <CalendarSheet />}
      {sheet === 'account' && <AccountSheet />}
    </>
  )
}
