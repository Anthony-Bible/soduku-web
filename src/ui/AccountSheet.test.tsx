// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore, SaveStore } from '../core'
import { AppController } from '../app/controller'
import { AppProvider } from '../app/AppContext'
import { FakeApi } from '../platform/fakeApi'
import { App } from './App'
import { relativeTime } from './format'

afterEach(cleanup)

function setup(api: FakeApi | null = new FakeApi(), kv = new MemoryStore()) {
  const controller = new AppController(kv, () => new Date(2026, 10, 1), api)
  render(
    <AppProvider controller={controller}>
      <App />
    </AppProvider>,
  )
  return { controller, api, kv }
}

async function openAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Account/ }))
}

async function requestEmail(user: ReturnType<typeof userEvent.setup>, email = 'Player@Example.com') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Send sign-in email' }))
}

describe('account button', () => {
  it('shows next to the Streak when Signed Out, and opens the sheet', async () => {
    const user = userEvent.setup()
    setup()
    const button = screen.getByRole('button', { name: 'Account, signed out' })
    expect(screen.getByLabelText('Daily Puzzle').contains(button)).toBe(true)
    await user.click(button)
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeTruthy()
  })

  it('is absent when there is no server to talk to', () => {
    setup(null)
    expect(screen.queryByRole('button', { name: /^Account/ })).toBeNull()
  })

  it('does not nag: nothing mentions signing in until the sheet is opened', () => {
    setup()
    expect(screen.queryByText(/sign in/i)).toBeNull()
  })
})

describe('Signed Out sheet', () => {
  it('asks for the email, then shows the generic message, the code boxes and the link note', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await openAccount(user)
    expect(screen.queryByRole('group', { name: 'Sign-in Code' })).toBeNull()
    await requestEmail(user)
    expect(api!.started).toEqual(['Player@Example.com'])
    expect(screen.getByText('If that email is on the invite list, a sign-in email is on its way.')).toBeTruthy()
    expect(screen.getByText("Or tap the link in the email if you're in a browser.")).toBeTruthy()
    const boxes = screen.getAllByRole('textbox', { name: /^Digit \d of 6$/ })
    expect(boxes).toHaveLength(6)
    for (const b of boxes) expect(b).toHaveAttribute('inputmode', 'numeric')
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('types a code digit by digit, advancing, and signs in', async () => {
    const user = userEvent.setup()
    const { controller } = setup()
    await openAccount(user)
    await requestEmail(user)
    await user.click(screen.getAllByRole('textbox', { name: /^Digit/ })[0]!)
    await user.keyboard('123456')
    await waitFor(() => expect(controller.getSnapshot().sync.account?.email).toBe('player@example.com'))
    expect(await screen.findByText(/Signed in as/)).toBeTruthy()
    expect(screen.getByText('player@example.com')).toBeTruthy()
  })

  it('accepts a whole pasted code', async () => {
    const user = userEvent.setup()
    const { controller } = setup()
    await openAccount(user)
    await requestEmail(user)
    await user.click(screen.getAllByRole('textbox', { name: /^Digit/ })[0]!)
    await user.paste('123456')
    await waitFor(() => expect(controller.getSnapshot().sync.account).not.toBeNull())
  })

  it('shows an error and clears the boxes for a wrong code', async () => {
    const user = userEvent.setup()
    const { controller } = setup()
    await openAccount(user)
    await requestEmail(user)
    await user.click(screen.getAllByRole('textbox', { name: /^Digit/ })[0]!)
    await user.keyboard('999999')
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't work/)
    expect(controller.getSnapshot().sync.account).toBeNull()
    for (const b of screen.getAllByRole('textbox', { name: /^Digit/ })) expect(b).toHaveValue('')
  })

  it('checks the code against the address the email went to, even if the field is edited afterwards', async () => {
    const user = userEvent.setup()
    const { controller } = setup()
    await openAccount(user)
    await requestEmail(user)
    await user.type(screen.getByLabelText('Email'), 'x')
    await user.click(screen.getAllByRole('textbox', { name: /^Digit/ })[0]!)
    await user.keyboard('123456')
    await waitFor(() => expect(controller.getSnapshot().sync.account?.email).toBe('player@example.com'))
  })

  it('warns before signing in removes progress that belongs to a different Account', async () => {
    const user = userEvent.setup()
    const kv = new MemoryStore()
    new SaveStore(kv).saveOwner('first@example.com')
    setup(new FakeApi(), kv)
    await openAccount(user)
    await requestEmail(user, 'second@example.com')
    expect((await screen.findByRole('alert')).textContent).toMatch(/belongs to first@example\.com/)
  })

  it('says so when the server cannot be reached', async () => {
    const user = userEvent.setup()
    const api = new FakeApi()
    api.offline = true
    setup(api)
    await openAccount(user)
    await requestEmail(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/reach the server/)
  })
})

describe('signed-in sheet', () => {
  async function signedInSheet() {
    const user = userEvent.setup()
    const ctx = setup()
    await ctx.controller.sync.signInWithCode('player@example.com', ctx.api!.code)
    await openAccount(user)
    return { user, ...ctx }
  }

  it('shows the email initial on the button, the email and when it last synced', async () => {
    const { controller } = await signedInSheet()
    expect(controller.getSnapshot().sync.account).not.toBeNull()
    expect(screen.getAllByText('player@example.com').length).toBeGreaterThan(0)
    expect(screen.getByText(/^Last synced /)).toBeTruthy()
  })

  it('shows the failure reason and a dot on the button after a failed sync', async () => {
    const { user, api, controller } = await signedInSheet()
    api!.offline = true
    await controller.sync.sync()
    expect(await screen.findByRole('alert')).toHaveTextContent(/reach the server/)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: /last sync failed/ })).toBeTruthy()
  })

  it('signs out through a confirm dialog and returns to the Signed Out sheet', async () => {
    const { user, controller, api } = await signedInSheet()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(dialog).toHaveTextContent(/progress is saved/)
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(controller.getSnapshot().sync.account).toBeNull())
    expect(api!.signedInAs).toBeNull()
  })

  it('warns that recent progress will be lost when the push fails, and still signs out offline', async () => {
    const { user, api, controller } = await signedInSheet()
    api!.offline = true
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(dialog).toHaveTextContent(/recent progress on this device will be lost/)
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(controller.getSnapshot().sync.account).toBeNull())
    expect(Object.keys(controller.profile.syncDoc().games)).toHaveLength(0)
    expect(controller.sync.signOutPending).toBe(true)
    // The still-valid cookie is not adopted again, and the sign-out is delivered once the server is back.
    api!.offline = false
    await controller.sync.adoptExistingSession()
    expect(controller.getSnapshot().sync.account).toBeNull()
    expect(api!.signedInAs).toBeNull()
    expect(controller.sync.signOutPending).toBe(false)
  })

  it('cancelling the dialog stays signed in', async () => {
    const { user, controller } = await signedInSheet()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(controller.getSnapshot().sync.account).not.toBeNull()
  })
})

describe('Statistics', () => {
  it('no longer offers a reset', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Statistics' }))
    expect(screen.queryByText(/reset/i)).toBeNull()
  })
})

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [44_000, 'just now'],
    [60_000, '1 minute ago'],
    [5 * 60_000, '5 minutes ago'],
    [2 * 3600_000, '2 hours ago'],
    [3 * 86_400_000, '3 days ago'],
    [-5000, 'just now'],
  ])('%i ms ago reads %s', (ms, text) => {
    expect(relativeTime(1_000_000_000_000, 1_000_000_000_000 - ms)).toBe(text)
  })
})
