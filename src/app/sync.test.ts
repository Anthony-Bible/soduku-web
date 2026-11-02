import { describe, expect, it } from 'vitest'
import { dayFromDate, MemoryStore } from '../core'
import { FakeApi } from '../platform/fakeApi'
import { AppController } from './controller'

const NOW = new Date(2026, 10, 1, 12)

function device(api: FakeApi | null, kv = new MemoryStore()) {
  const controller = new AppController(kv, () => NOW, api)
  return { controller, kv }
}

/** Plays an Easy game to a win. */
function winOne(controller: AppController): void {
  controller.startNewGame('easy')
  const session = controller.getSnapshot().session!
  for (let p = 0; p < 81; p++) {
    if (!session.state.board[p].given) {
      session.select(p)
      session.tapNumber(session.state.solution[p].value)
    }
  }
}

async function signIn(controller: AppController, api: FakeApi) {
  await controller.sync.signInWithCode('Player@Example.com', api.code)
}

describe('signing in', () => {
  it('merges what the device already has into the Account without losing it', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    const before = controller.profile.statistics.easy.won
    expect(before).toBe(1)
    await signIn(controller, api)
    expect(controller.getSnapshot().sync.account).toEqual({ email: 'player@example.com' })
    expect(Object.keys(api.doc.games)).toHaveLength(1)
    expect(controller.profile.statistics.easy.won).toBe(1)
    expect(controller.getSnapshot().sync.lastSyncedAt).not.toBeNull()
  })

  it('a second device signing in receives the first one\'s Games and does not double count', async () => {
    const api = new FakeApi()
    const phone = device(api).controller
    winOne(phone)
    phone.goHome()
    await signIn(phone, api)

    const laptop = device(api).controller
    winOne(laptop)
    laptop.goHome()
    await signIn(laptop, api)
    await phone.sync.sync()

    for (const c of [phone, laptop]) {
      expect(c.profile.statistics.easy.won).toBe(2)
      expect(c.profile.statistics.easy.played).toBe(2)
    }
    // Syncing again changes nothing.
    await laptop.sync.sync()
    await phone.sync.sync()
    expect(laptop.profile.statistics.easy.won).toBe(2)
  })

  it('rejects a wrong code and stays Signed Out', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await expect(controller.sync.signInWithCode('player@example.com', '000000')).rejects.toMatchObject({ kind: 'rejected' })
    expect(controller.getSnapshot().sync.account).toBeNull()
  })

  it('remembers the Account across a reload', async () => {
    const api = new FakeApi()
    const first = device(api)
    await signIn(first.controller, api)
    const reloaded = device(api, first.kv).controller
    expect(reloaded.getSnapshot().sync.account).toEqual({ email: 'player@example.com' })
  })

  it('adopts a session made in this browser, such as by tapping the Magic Link', async () => {
    const api = new FakeApi()
    api.signedInAs = 'player@example.com'
    const { controller } = device(api)
    await controller.sync.adoptExistingSession()
    expect(controller.getSnapshot().sync.account?.email).toBe('player@example.com')
  })
})

describe('syncing', () => {
  it('play is never blocked offline; the error shows and the next sync catches up', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    api.offline = true
    winOne(controller)
    await controller.sync.sync()
    expect(controller.getSnapshot().sync.error).toMatch(/server/i)
    expect(controller.profile.statistics.easy.won).toBe(1)
    api.offline = false
    await controller.sync.sync()
    expect(controller.getSnapshot().sync.error).toBeNull()
    expect(Object.keys(api.doc.games)).toHaveLength(1)
  })

  it('a finished Game syncs by itself', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    const before = api.syncs
    winOne(controller)
    await new Promise((r) => setTimeout(r, 0))
    expect(api.syncs).toBeGreaterThan(before)
    expect(Object.values(api.doc.games).some((g) => g.wonSeconds !== null)).toBe(true)
  })

  it('when the server ends the session the device goes Signed Out but keeps its progress', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    await signIn(controller, api)
    api.sessionEnded = true
    await controller.sync.sync()
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(controller.profile.statistics.easy.won).toBe(1)
  })

  it('does nothing without a server', async () => {
    const { controller } = device(null)
    expect(await controller.sync.sync()).toBe(false)
    expect(controller.sync.available).toBe(false)
  })
})

describe('signing out', () => {
  it('clears this device to an empty Signed Out state and keeps the Account\'s data on the server', async () => {
    const api = new FakeApi()
    const { controller, kv } = device(api)
    winOne(controller)
    controller.goHome()
    await signIn(controller, api)
    await controller.signOut()
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(controller.profile.statistics.easy.played).toBe(0)
    expect(controller.profile.savedGame()).toBeNull()
    expect(Object.keys(api.doc.games)).toHaveLength(1)
    // A reload is still empty and Signed Out.
    const reloaded = device(api, kv).controller
    expect(reloaded.getSnapshot().sync.account).toBeNull()
    expect(reloaded.profile.statistics.easy.played).toBe(0)
    // Signing back in brings everything back.
    await signIn(reloaded, api)
    expect(reloaded.profile.statistics.easy.won).toBe(1)
  })

  it('always signs out, even offline: the device is emptied and the cookie is not adopted again', async () => {
    const api = new FakeApi()
    const { controller, kv } = device(api)
    winOne(controller)
    controller.goHome()
    await signIn(controller, api)
    api.offline = true
    await controller.signOut()
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(controller.profile.statistics.easy.played).toBe(0)
    expect(controller.sync.signOutPending).toBe(true)
    // Still offline or not, the valid cookie cannot sign the device back in, even after a reload.
    api.offline = false
    const reloaded = device(api, kv).controller
    expect(reloaded.sync.signOutPending).toBe(true)
    await reloaded.sync.adoptExistingSession()
    expect(reloaded.getSnapshot().sync.account).toBeNull()
    expect(api.signedInAs).toBeNull()
    expect(reloaded.sync.signOutPending).toBe(false)
    expect(Object.keys(api.doc.games)).toHaveLength(1)
  })

  it('keeps retrying the sign-out until the server confirms', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    api.offline = true
    await controller.signOut()
    await controller.sync.retryPendingSignOut()
    expect(controller.sync.signOutPending).toBe(true)
    api.offline = false
    await controller.sync.retryPendingSignOut()
    expect(controller.sync.signOutPending).toBe(false)
    expect(api.signedInAs).toBeNull()
  })

  it('signing in again while a sign-out is pending clears the marker', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    api.offline = true
    await controller.signOut()
    api.offline = false
    await signIn(controller, api)
    expect(controller.sync.signOutPending).toBe(false)
    expect(controller.getSnapshot().sync.account?.email).toBe('player@example.com')
  })

  it('a sync in flight when the player signs out does not put the Account back on the device', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    await signIn(controller, api)
    let release!: () => void
    api.gate = new Promise<void>((r) => (release = r))
    const inFlight = controller.sync.sync()
    const out = controller.signOut()
    release()
    await Promise.all([inFlight, out])
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(controller.profile.statistics.easy.won).toBe(0)
  })

  it('a hidden-page sync that queues behind a running one still goes out with keepalive', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    let release!: () => void
    api.gate = new Promise<void>((r) => (release = r))
    api.keepalives = []
    const first = controller.sync.sync()
    const hidden = controller.sync.sync({ keepalive: true })
    release()
    await Promise.all([first, hidden])
    expect(api.keepalives).toEqual([false, true])
  })
})

describe('Signed Out play', () => {
  it('works exactly as before, with a Daily Puzzle too', () => {
    const { controller } = device(null)
    controller.openToday()
    expect(controller.getSnapshot().session).not.toBeNull()
    expect(dayFromDate(NOW)).toBe(controller.getSnapshot().today)
  })
})

describe('a session that belongs to another Account', () => {
  it('merges nothing and ends that session instead of copying progress into it', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    await signIn(controller, api)
    const before = JSON.stringify(api.doc)
    api.offline = true
    winOne(controller)
    controller.goHome()
    await controller.sync.sync()
    api.offline = false
    api.signedInAs = 'other@example.com' // a Magic Link for another Account replaced the cookie
    expect(await controller.sync.sync()).toBe(false)
    expect(JSON.stringify(api.doc)).toBe(before)
    expect(api.signedInAs).toBeNull()
    expect(controller.getSnapshot().sync.error).toMatch(/different Account/)
    expect(controller.profile.statistics.easy.won).toBe(2) // local progress untouched
  })
})

describe('progress never moves between Accounts', () => {
  it('after a lost session (409 then 401), signing in as a different Account clears the device first', async () => {
    const api = new FakeApi('a@example.com', 'b@example.com')
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    await controller.sync.signInWithCode('a@example.com', api.code)
    expect(Object.keys(api.docs['a@example.com'].games)).toHaveLength(1)
    api.signedInAs = 'b@example.com' // a Magic Link for B replaced the cookie
    await controller.sync.sync() // 409: B's session is ended
    await controller.sync.sync() // 401: the device goes Signed Out
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(controller.profile.statistics.easy.won).toBe(1) // kept for A
    await controller.sync.signInWithCode('b@example.com', api.code)
    expect(controller.profile.statistics.easy.won).toBe(0)
    expect(Object.keys(api.docs['b@example.com'].games)).toHaveLength(0)
    expect(Object.keys(api.docs['a@example.com'].games)).toHaveLength(1)
  })

  it('after a lost session, signing in as the same Account merges the progress back', async () => {
    const api = new FakeApi('a@example.com', 'b@example.com')
    const { controller } = device(api)
    await controller.sync.signInWithCode('a@example.com', api.code)
    api.sessionEnded = true
    winOne(controller)
    controller.goHome()
    await controller.sync.sync()
    expect(controller.getSnapshot().sync.account).toBeNull()
    api.sessionEnded = false
    await controller.sync.signInWithCode('a@example.com', api.code)
    expect(Object.keys(api.docs['a@example.com'].games)).toHaveLength(1)
  })

  it('progress made Signed Out merges into whichever Account signs in first', async () => {
    const api = new FakeApi('a@example.com', 'b@example.com')
    const { controller } = device(api)
    winOne(controller)
    controller.goHome()
    await controller.sync.signInWithCode('b@example.com', api.code)
    expect(Object.keys(api.docs['b@example.com'].games)).toHaveLength(1)
  })
})

describe('another tab signing out', () => {
  it('closes the Game open here and leaves the device empty', async () => {
    const api = new FakeApi()
    const kv = new MemoryStore()
    const a = device(api, kv).controller
    winOne(a)
    a.goHome()
    await signIn(a, api)
    const b = device(api, kv).controller
    b.startNewGame('medium')
    await a.signOut()
    b.storageChanged()
    expect(b.getSnapshot().session).toBeNull()
    expect(b.getSnapshot().sync.account).toBeNull()
    expect(b.profile.statistics.easy.played).toBe(0)
  })

  it('closes the Game open here when that tab signs in to a different Account', async () => {
    const api = new FakeApi('a@example.com', 'b@example.com')
    const kv = new MemoryStore()
    const a = device(api, kv).controller
    await a.sync.signInWithCode('a@example.com', api.code)
    const b = device(api, kv).controller
    b.startNewGame('medium')
    const gameOfA = b.getSnapshot().session!.state.id
    await a.signOut()
    await a.sync.signInWithCode('b@example.com', api.code)
    b.storageChanged() // the two storage events arrive together, after both changes
    expect(b.getSnapshot().session).toBeNull()
    await b.sync.sync()
    expect(Object.keys(api.docs['b@example.com'].games)).not.toContain(gameOfA)
  })
})

describe('a sign-out that could not reach the server', () => {
  it('is delivered before signing in with a code, so the old session does not stay valid', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    api.offline = true
    await controller.signOut()
    expect(controller.sync.signOutPending).toBe(true)
    api.offline = false
    const endedSessions: string[] = []
    const signOut = api.signOut.bind(api)
    api.signOut = async () => {
      endedSessions.push(api.signedInAs ?? '')
      await signOut()
    }
    await signIn(controller, api)
    expect(endedSessions).toEqual(['player@example.com'])
    expect(controller.sync.signOutPending).toBe(false)
    expect(controller.sync.getStatus().account?.email).toBe('player@example.com')
  })

  it('stops a code sign-in while the old session still cannot be ended', async () => {
    const api = new FakeApi()
    const { controller } = device(api)
    await signIn(controller, api)
    api.offline = true
    await controller.signOut()
    await expect(signIn(controller, api)).rejects.toThrow()
    expect(controller.sync.getStatus().account).toBeNull()
  })

  it('is delivered before a new Sign-in Email is sent, so it never ends the Magic Link session', async () => {
    const kv = new MemoryStore()
    const api = new FakeApi()
    const now = () => new Date(2026, 10, 2, 12)
    const a = new AppController(kv, now, api)
    await a.sync.signInWithCode('player@example.com', '123456')
    api.offline = true
    await a.signOut()
    expect(a.sync.signOutPending).toBe(true)
    api.offline = false
    await a.sync.startSignIn('player@example.com')
    expect(a.sync.signOutPending).toBe(false)
    api.signedInAs = 'player@example.com' // the Magic Link was opened in this browser
    const tab = new AppController(kv, now, api)
    await tab.sync.adoptExistingSession()
    expect(api.signedInAs).toBe('player@example.com')
    expect(tab.sync.getStatus().account?.email).toBe('player@example.com')
  })
})
