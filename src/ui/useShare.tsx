import { useState } from 'react'
import { Icon } from './Icon'
import { canShare, shareResult, shareText, type ShareInput, type ShareOutcome } from './share'

/** The Share button and what happened, for any result text: `text` is built when Share is pressed. */
export function useShareText(text: (url: string) => string) {
  const [status, setStatus] = useState<ShareOutcome | null>(null)
  const share = async () => {
    setStatus(await shareResult(navigator, text(window.location.origin)))
  }
  const button = canShare(navigator) ? (
    <button type="button" className="btn" onClick={() => void share()}>
      <Icon name="share" size={18} /> Share
    </button>
  ) : null
  const message =
    status === 'copied' || status === 'failed' ? (
      <p className="muted form-message" role="status">
        {status === 'copied' ? 'Copied to the clipboard.' : "Couldn't share. Try again."}
      </p>
    ) : null
  return { button, message }
}

/** The Share button and what happened, for the Sudoku win screen and the Calendar. */
export function useShare(input: Omit<ShareInput, 'url'>) {
  return useShareText((url) => shareText({ ...input, url }))
}
