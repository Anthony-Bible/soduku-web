// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../core'
import { AppController } from '../app/controller'
import { AppProvider } from '../app/AppContext'
import { InstallProvider } from '../app/InstallContext'
import { FakeApi } from '../platform/fakeApi'
import { Installer, type DeferredPrompt } from '../platform/install'
import { App } from './App'

afterEach(cleanup)

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function setup(o: { ua?: string; standalone?: boolean; kv?: MemoryStore } = {}) {
  const kv = o.kv ?? new MemoryStore()
  const controller = new AppController(kv, () => new Date(2026, 10, 1), new FakeApi())
  const installer = new Installer(
    { userAgent: o.ua ?? CHROME, maxTouchPoints: o.ua === IPHONE ? 5 : 0, standalone: o.standalone ?? false },
    kv,
  )
  render(
    <AppProvider controller={controller}>
      <InstallProvider installer={installer}>
        <App />
      </InstallProvider>
    </AppProvider>,
  )
  return { controller, installer, kv }
}

function winOne(controller: AppController) {
  act(() => {
    controller.startNewGame('easy')
    const session = controller.getSnapshot().session!
    for (let p = 0; p < 81; p++) {
      if (!session.state.board[p].given) {
        session.select(p)
        session.tapNumber(session.state.solution[p].value)
      }
    }
    controller.goHome()
  })
}

function offer(installer: Installer) {
  let prompted = 0
  const e: DeferredPrompt = {
    prompt: () => {
      prompted++
      return Promise.resolve()
    },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  }
  act(() => installer.offerPrompt(e))
  return () => prompted
}

const banner = () => screen.queryByRole('region', { name: 'Install Sudoku' })

describe('install banner on Home', () => {
  it('waits for the first won Game', () => {
    const { controller, installer } = setup()
    offer(installer)
    expect(banner()).toBeNull()
    winOne(controller)
    expect(banner()).not.toBeNull()
  })

  it('installs with one tap and then goes away', async () => {
    const user = userEvent.setup()
    const { controller, installer } = setup()
    const prompted = offer(installer)
    winOne(controller)
    await user.click(screen.getByRole('button', { name: 'Install' }))
    expect(prompted()).toBe(1)
    expect(banner()).toBeNull()
  })

  it('stays closed on this device after ✕', async () => {
    const user = userEvent.setup()
    const kv = new MemoryStore()
    const first = setup({ kv })
    offer(first.installer)
    winOne(first.controller)
    await user.click(screen.getByRole('button', { name: 'Close install suggestion' }))
    expect(banner()).toBeNull()
    cleanup()
    const again = setup({ kv })
    offer(again.installer)
    expect(again.controller.profile.achievements.solveCount).toBe(1)
    expect(banner()).toBeNull()
  })

  it('shows nothing where the browser cannot install', () => {
    const { controller } = setup()
    winOne(controller)
    expect(banner()).toBeNull()
  })

  it('gives iPhone steps and warns that the Installed App starts empty', () => {
    const { controller } = setup({ ua: IPHONE })
    winOne(controller)
    expect(banner()).not.toBeNull()
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
    expect(screen.getByText(/starts empty/)).toBeTruthy()
  })

  it('never shows inside the Installed App', () => {
    const { controller } = setup({ ua: IPHONE, standalone: true })
    winOne(controller)
    expect(banner()).toBeNull()
  })
})

describe('install in the Account sheet', () => {
  it('is offered before any win and after the banner was closed', async () => {
    const user = userEvent.setup()
    const { installer } = setup()
    offer(installer)
    act(() => installer.dismiss(Date.now()))
    await user.click(screen.getByRole('button', { name: /^Account/ }))
    expect(screen.getByRole('region', { name: 'Install app' })).toBeTruthy()
  })

  it('tells the iPhone Installed App to type the code', async () => {
    const user = userEvent.setup()
    setup({ ua: IPHONE, standalone: true })
    await user.click(screen.getByRole('button', { name: /^Account/ }))
    expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull()
    await user.type(screen.getByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send sign-in email' }))
    expect(await screen.findByText(/opens in Safari, not in this app/)).toBeTruthy()
  })
})
