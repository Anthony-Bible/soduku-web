import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useApp } from '../app/AppContext'
import { useInstall } from '../app/InstallContext'
import { ApiError } from '../platform/api'
import { ConfirmDialog } from './ConfirmDialog'
import { InstallSection } from './Install'
import { Sheet } from './Sheet'
import { relativeTime } from './format'

const CODE_LENGTH = 6

function SignedOut() {
  const { controller } = useApp()
  const [email, setEmail] = useState('')
  // The address the Sign-in Email was sent to; editing the field afterwards must not change what the code is checked against.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const address = email.trim()
      await controller.sync.startSignIn(address)
      setSentTo(address)
    } catch {
      setError("Couldn't reach the server. Try again when you're online.")
    } finally {
      setBusy(false)
    }
  }

  const otherOwner = sentTo === null ? null : controller.sync.progressOwnerOtherThan(sentTo)
  const { iosStandalone } = useInstall()

  return (
    <div className="account-form">
      <form className="account-form" onSubmit={send}>
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          className="text-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
          Send sign-in email
        </button>
      </form>
      {sentTo !== null && (
        <p className="form-message muted" role="status">
          If that email is on the invite list, a sign-in email is on its way.
        </p>
      )}
      {error && (
        <p className="form-message form-error" role="alert">
          {error}
        </p>
      )}
      {otherOwner !== null && (
        <p className="form-message form-error" role="alert">
          The progress on this device belongs to {otherOwner}. Signing in as {sentTo} removes it from this device; sign
          in as {otherOwner} to keep it.
        </p>
      )}
      {sentTo !== null && <CodeEntry key={sentTo} email={sentTo} />}
      {sentTo !== null && (
        <p className="muted form-message">
          {iosStandalone
            ? 'Type the code from the email here. Its link opens in Safari, not in this app.'
            : "Or tap the link in the email if you're in a browser."}
        </p>
      )}
    </div>
  )
}

function CodeEntry({ email }: { email: string }) {
  const { controller } = useApp()
  const [digits, setDigits] = useState<string[]>(() => Array<string>(CODE_LENGTH).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const submit = async (code: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await controller.sync.signInWithCode(email, code)
    } catch (e) {
      setDigits(Array<string>(CODE_LENGTH).fill(''))
      refs.current[0]?.focus()
      setError(
        e instanceof ApiError && e.kind === 'rejected'
          ? "That code didn't work. Check it, or ask for a new sign-in email."
          : "Couldn't reach the server. Try again when you're online.",
      )
    } finally {
      setBusy(false)
    }
  }

  /** Puts `text` into the boxes from `start`, then moves focus on and submits when the code is complete. */
  const fill = (start: number, text: string) => {
    const typed = text.replace(/\D/g, '').slice(0, CODE_LENGTH - start)
    if (!typed) return
    const next = [...digits]
    for (let i = 0; i < typed.length; i++) next[start + i] = typed.charAt(i)
    setDigits(next)
    refs.current[Math.min(start + typed.length, CODE_LENGTH - 1)]?.focus()
    if (next.every((d) => d !== '')) void submit(next.join(''))
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      refs.current[i - 1]?.focus()
    }
  }

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    fill(i, e.clipboardData.getData('text'))
  }

  return (
    <div className="account-form">
      <div role="group" aria-label="Sign-in Code" className="code-boxes">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className="code-box"
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={CODE_LENGTH}
            aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
            value={d}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '')
              if (v === '') {
                const next = [...digits]
                next[i] = ''
                setDigits(next)
              } else fill(i, v)
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
      {error && (
        <p className="form-message form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** The current time, refreshed every 30 seconds, for relative times. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function SignedIn({ email }: { email: string }) {
  const { controller, sync } = useApp()
  const now = useNow()
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // True when the last push failed, so signing out would lose recent progress on this device.
  const [unsaved, setUnsaved] = useState(false)

  const askToSignOut = async () => {
    setChecking(true)
    const ok = await controller.sync.sync()
    setChecking(false)
    // Signing out is always possible. A failed push only changes what the dialog warns about.
    setUnsaved(!ok)
    setConfirming(true)
  }

  return (
    <div className="account-form">
      <p>
        Signed in as <strong>{email}</strong>
      </p>
      <p className="muted form-message">
        {sync.lastSyncedAt === null ? 'Not synced yet' : `Last synced ${relativeTime(now, sync.lastSyncedAt)}`}
        {sync.syncing ? ' · syncing…' : ''}
      </p>
      {sync.error && (
        <p className="form-message form-error" role="alert">
          {sync.error}
        </p>
      )}
      <button type="button" className="btn" disabled={sync.syncing} onClick={() => void controller.sync.sync()}>
        Sync now
      </button>
      <button type="button" className="btn btn-danger-text" disabled={checking} onClick={() => void askToSignOut()}>
        Sign out
      </button>
      {confirming && (
        <ConfirmDialog
          title="Sign out?"
          message={
            unsaved
              ? "Your latest progress couldn't be saved to your Account, so recent progress on this device will be lost if you sign out. This device will go back to an empty, signed out state."
              : 'Your progress is saved to your Account. This device will go back to an empty, signed out state.'
          }
          confirmLabel="Sign out"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void controller.signOut()
          }}
        />
      )}
    </div>
  )
}

export function AccountSheet() {
  const { controller, sync } = useApp()
  return (
    <Sheet title="Account" onClose={() => controller.openSheet(null)}>
      {sync.account ? <SignedIn email={sync.account.email} /> : <SignedOut />}
      <InstallSection />
    </Sheet>
  )
}
