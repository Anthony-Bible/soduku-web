// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useBackNavigation } from './useBackNavigation'
import type { AppController } from './controller'

const controller = {
  getSnapshot: () => ({ sheet: null }),
  openSheet: vi.fn(),
  goHome: vi.fn(),
} as unknown as AppController

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '')
})

describe('useBackNavigation after a reload', () => {
  it('rewinds past history entries left over from before the reload', () => {
    window.history.replaceState({ sudokuLevel: 2 }, '')
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    renderHook(() => useBackNavigation(controller, 0))
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-2)
  })

  it('leaves history alone on a fresh load', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    renderHook(() => useBackNavigation(controller, 0))
    expect(go).not.toHaveBeenCalled()
  })
})
