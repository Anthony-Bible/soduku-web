import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../core'
import { DISMISS_MS, Installer, detectInstallMethod, shouldShowBanner, type DeferredPrompt } from './install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
}

const env = (userAgent: string, o: Partial<{ standalone: boolean; promptReady: boolean; maxTouchPoints: number }> = {}) => ({
  userAgent,
  standalone: false,
  promptReady: false,
  maxTouchPoints: 0,
  ...o,
})

describe('detectInstallMethod', () => {
  it('picks the way each browser installs', () => {
    expect(detectInstallMethod(env(UA.iphoneSafari, { maxTouchPoints: 5 }))).toBe('ios')
    expect(detectInstallMethod(env(UA.iphoneChrome, { maxTouchPoints: 5 }))).toBe('ios')
    // iPadOS asks for the desktop site and reports a Mac.
    expect(detectInstallMethod(env(UA.macSafari, { maxTouchPoints: 5 }))).toBe('ios')
    expect(detectInstallMethod(env(UA.macSafari))).toBe('mac-safari')
    expect(detectInstallMethod(env(UA.macChrome, { promptReady: true }))).toBe('prompt')
    expect(detectInstallMethod(env(UA.android, { promptReady: true }))).toBe('prompt')
  })

  it('offers nothing where the browser cannot install', () => {
    expect(detectInstallMethod(env(UA.macChrome))).toBeNull()
    expect(detectInstallMethod(env(UA.macFirefox))).toBeNull()
    expect(detectInstallMethod(env(UA.android))).toBeNull()
  })

  it('offers nothing inside an Installed App, whatever the browser says', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), fc.nat(10), (ua, promptReady, touch) => {
        expect(detectInstallMethod({ userAgent: ua, standalone: true, promptReady, maxTouchPoints: touch })).toBeNull()
      }),
    )
  })

  it('prefers the one-tap prompt whenever the browser offers it', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(UA)), fc.nat(10), (ua, touch) => {
        expect(detectInstallMethod({ userAgent: ua, standalone: false, promptReady: true, maxTouchPoints: touch })).toBe(
          'prompt',
        )
      }),
    )
  })
})

describe('shouldShowBanner', () => {
  const method = fc.constantFrom('prompt' as const, 'ios' as const, 'mac-safari' as const)
  const time = fc.integer({ min: 0, max: 4_000_000_000_000 })

  it('never shows before the first win or where installing is impossible', () => {
    fc.assert(
      fc.property(fc.option(method, { nil: null }), fc.nat(), fc.option(time, { nil: null }), time, (m, wins, d, now) => {
        if (m === null || wins === 0) expect(shouldShowBanner({ method: m, wins, dismissedAt: d, now })).toBe(false)
      }),
    )
  })

  it('stays away for 30 days after it is closed, then comes back', () => {
    fc.assert(
      fc.property(method, fc.integer({ min: 1, max: 1000 }), time, fc.integer({ min: 0, max: 3 * DISMISS_MS }), (m, wins, d, gap) => {
        expect(shouldShowBanner({ method: m, wins, dismissedAt: d, now: d + gap })).toBe(gap >= DISMISS_MS)
      }),
    )
  })

  it('shows after a win when never closed', () => {
    expect(shouldShowBanner({ method: 'ios', wins: 1, dismissedAt: null, now: 0 })).toBe(true)
  })
})

function fakePrompt(outcome: 'accepted' | 'dismissed') {
  let prompted = 0
  const e: DeferredPrompt = {
    prompt: () => {
      prompted++
      return Promise.resolve()
    },
    userChoice: Promise.resolve({ outcome }),
  }
  return { e, prompted: () => prompted }
}

describe('Installer', () => {
  const chrome = { userAgent: UA.macChrome, maxTouchPoints: 0, standalone: false }

  it('installing through the prompt hides every install offer', async () => {
    const i = new Installer(chrome, new MemoryStore())
    expect(i.getSnapshot().method).toBeNull()
    const p = fakePrompt('accepted')
    i.offerPrompt(p.e)
    expect(i.getSnapshot().method).toBe('prompt')
    await i.install()
    expect(p.prompted()).toBe(1)
    expect(i.getSnapshot().method).toBeNull()
  })

  it('a declined prompt cannot be shown twice', async () => {
    const i = new Installer(chrome, new MemoryStore())
    const p = fakePrompt('dismissed')
    i.offerPrompt(p.e)
    await i.install()
    await i.install()
    expect(p.prompted()).toBe(1)
    expect(i.getSnapshot().method).toBeNull()
  })

  it('appinstalled from the browser menu also hides the offers', () => {
    const i = new Installer(chrome, new MemoryStore())
    i.offerPrompt(fakePrompt('accepted').e)
    i.markInstalled()
    expect(i.getSnapshot().method).toBeNull()
  })

  it('remembers a dismissal on this device across reloads', () => {
    const kv = new MemoryStore()
    new Installer(chrome, kv).dismiss(1234)
    expect(new Installer(chrome, kv).getSnapshot().dismissedAt).toBe(1234)
  })

  it('knows when it runs as an Installed App on iPhone', () => {
    const i = new Installer({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: true }, new MemoryStore())
    expect(i.getSnapshot()).toMatchObject({ method: null, iosStandalone: true })
  })

  it('notifies subscribers with a fresh snapshot', () => {
    const i = new Installer(chrome, new MemoryStore())
    const before = i.getSnapshot()
    let calls = 0
    i.subscribe(() => calls++)
    i.dismiss(1)
    expect(calls).toBe(1)
    expect(i.getSnapshot()).not.toBe(before)
  })
})
