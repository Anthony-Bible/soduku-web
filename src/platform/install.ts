import type { KeyValueStore } from '../core'

/**
 * How this browser can turn the page into an Installed App:
 * - `prompt`: Chromium offered `beforeinstallprompt`, so one tap opens the browser's own install dialog.
 * - `ios`: iPhone or iPad in any browser; Share → Add to Home Screen.
 * - `mac-safari`: Safari on a Mac; File → Add to Dock.
 */
export type InstallMethod = 'prompt' | 'ios' | 'mac-safari'

export interface InstallEnv {
  /** Already running as an Installed App. */
  standalone: boolean
  /** A deferred `beforeinstallprompt` is in hand. */
  promptReady: boolean
  userAgent: string
  maxTouchPoints: number
}

/** iPadOS reports a Mac user agent, so a touch screen is what tells them apart. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function detectInstallMethod(env: InstallEnv): InstallMethod | null {
  if (env.standalone) return null
  if (env.promptReady) return 'prompt'
  if (isIos(env.userAgent, env.maxTouchPoints)) return 'ios'
  const ua = env.userAgent
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua)) {
    return 'mac-safari'
  }
  return null
}

export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000

/** The Home banner waits for the first won Game and stays away for 30 days after it is closed. */
export function shouldShowBanner(o: {
  method: InstallMethod | null
  wins: number
  dismissedAt: number | null
  now: number
}): boolean {
  if (o.method === null || o.wins < 1) return false
  return o.dismissedAt === null || o.now - o.dismissedAt >= DISMISS_MS
}

/** The parts of `beforeinstallprompt` this app uses (Chromium only, not in the DOM typings). */
export interface DeferredPrompt {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallSnapshot {
  method: InstallMethod | null
  /** Running as an Installed App on iPhone or iPad, where links in email open in Safari instead. */
  iosStandalone: boolean
  dismissedAt: number | null
}

// Per device on purpose: it is not part of the synced document and survives signing out.
const DISMISSED_KEY = 'sudoku.installDismissedAt'

export class Installer {
  private deferred: DeferredPrompt | null = null
  private installed = false
  private standalone: boolean
  private snapshot: InstallSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly env: { userAgent: string; maxTouchPoints: number; standalone: boolean },
    private readonly store: KeyValueStore,
  ) {
    this.standalone = env.standalone
    this.snapshot = this.compute()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): InstallSnapshot => this.snapshot

  /** Call from a `beforeinstallprompt` listener after `preventDefault()`. */
  offerPrompt(e: DeferredPrompt): void {
    this.deferred = e
    this.changed()
  }

  markInstalled(): void {
    this.installed = true
    this.deferred = null
    this.changed()
  }

  setStandalone(standalone: boolean): void {
    this.standalone = standalone
    this.changed()
  }

  /** Opens the browser's install dialog. A prompt can be used only once, whatever the answer. */
  async install(): Promise<void> {
    const e = this.deferred
    if (!e) return
    this.deferred = null
    try {
      await e.prompt()
      const { outcome } = await e.userChoice
      if (outcome === 'accepted') this.installed = true
    } catch {
      // The browser refused to show it; the hint simply goes away until it offers a new one.
    }
    this.changed()
  }

  dismiss(now: number): void {
    this.store.setItem(DISMISSED_KEY, String(now))
    this.changed()
  }

  private readDismissed(): number | null {
    const raw = this.store.getItem(DISMISSED_KEY)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  private compute(): InstallSnapshot {
    const standalone = this.standalone || this.installed
    return {
      method: detectInstallMethod({
        standalone,
        promptReady: this.deferred !== null,
        userAgent: this.env.userAgent,
        maxTouchPoints: this.env.maxTouchPoints,
      }),
      iosStandalone: this.standalone && isIos(this.env.userAgent, this.env.maxTouchPoints),
      dismissedAt: this.readDismissed(),
    }
  }

  private changed(): void {
    this.snapshot = this.compute()
    for (const fn of this.listeners) fn()
  }
}

/** Wires an Installer to the browser. Call before React renders: `beforeinstallprompt` can fire early. */
export function attachInstaller(win: Window, store: KeyValueStore): Installer {
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(display-mode: standalone)') : null
  const navStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  const installer = new Installer(
    {
      userAgent: win.navigator.userAgent,
      maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
      standalone: navStandalone || (mq?.matches ?? false),
    },
    store,
  )
  win.addEventListener('beforeinstallprompt', (e) => {
    // Keeps Chrome's own mini-infobar away; the app shows its banner at a better moment.
    e.preventDefault()
    installer.offerPrompt(e as unknown as DeferredPrompt)
  })
  win.addEventListener('appinstalled', () => installer.markInstalled())
  mq?.addEventListener?.('change', () => installer.setStandalone(navStandalone || mq.matches))
  return installer
}
