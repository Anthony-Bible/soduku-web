import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useInstall } from '../app/InstallContext'
import { shouldShowBanner } from '../platform/install'
import { Icon } from './Icon'

/** What to do on this device; shared by the Home banner and the Account sheet. */
function InstallSteps() {
  const { method, installer } = useInstall()
  const { controller, sync } = useApp()
  if (method === 'prompt') {
    return (
      <>
        <p className="muted form-message">Play offline from your home screen.</p>
        <button type="button" className="btn btn-primary" onClick={() => void installer?.install()}>
          <Icon name="download" size={18} /> Install
        </button>
      </>
    )
  }
  if (method === 'mac-safari') {
    return <p className="muted form-message">In Safari, choose File → Add to Dock.</p>
  }
  if (method === 'ios') {
    return (
      <>
        <p className="form-message">
          Tap Share <Icon name="share" size={16} />, then <strong>Add to Home Screen</strong>.
        </p>
        <p className="muted form-message">If you don&apos;t see it, open this page in Safari.</p>
        {controller.sync.available &&
          (sync.account ? (
            <p className="muted form-message">Then open Sudoku from your home screen and sign in again there.</p>
          ) : (
            <p className="muted form-message">
              The app on your home screen starts empty: your progress here stays in this browser unless you sign in
              first.
            </p>
          ))}
      </>
    )
  }
  return null
}

export function InstallBanner() {
  const { method, dismissedAt, installer } = useInstall()
  const { controller } = useApp()
  // Read once per visit to Home; a closed banner hides at once because its dismissal is later than this.
  const [now] = useState(() => Date.now())
  const wins = controller.profile.achievements.solveCount
  if (!installer || !shouldShowBanner({ method, wins, dismissedAt, now })) return null
  return (
    <section className="card install-card" aria-label="Install Sudoku">
      <div className="install-top">
        <h2>
          <Icon name="download" size={20} /> Install Sudoku
        </h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close install suggestion"
          onClick={() => installer.dismiss(Date.now())}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <InstallSteps />
    </section>
  )
}

/** The permanent way in, for anyone who closed the banner or wants it before a win. */
export function InstallSection() {
  const { method } = useInstall()
  if (method === null) return null
  return (
    <section className="account-form install-section" aria-label="Install app">
      <h3>Install app</h3>
      <InstallSteps />
    </section>
  )
}
