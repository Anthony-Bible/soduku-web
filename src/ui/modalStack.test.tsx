// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { ConfirmDialog } from './ConfirmDialog'

function Under() {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="under">
      <button>New Game</button>
      <button>Home</button>
    </div>
  )
}

afterEach(cleanup)

describe('stacked modals', () => {
  it('keeps Tab inside a confirm opened over another trapped modal', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <>
        <Under />
        <ConfirmDialog title="Abandon?" message="m" confirmLabel="Start New" onCancel={() => {}} onConfirm={onConfirm} />
      </>,
    )
    const dialog = screen.getByRole('alertdialog')
    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Start New' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
