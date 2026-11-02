import { displayName, shortTitle, type CalendarDay, type Difficulty } from '../core'
import { formatElapsed } from './format'

export interface ShareInput {
  difficulty: Difficulty
  seconds: number
  mistakes: number
  hintsUsed: number
  /** Set for a Daily Puzzle, so friends can play the same day. */
  dailyDay: CalendarDay | null
  /** The current Streak; shown for a Daily Puzzle when it is 2 or more. */
  streak: number
  url: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The result text for the share sheet. It never reveals the puzzle. */
export function shareText(r: ShareInput): string {
  const title =
    r.dailyDay !== null
      ? `Sudoku · Daily Puzzle ${shortTitle(r.dailyDay)} · ${displayName(r.difficulty)}`
      : `Sudoku · ${displayName(r.difficulty)}`
  const parts = [`⏱ ${formatElapsed(r.seconds)}`, plural(r.mistakes, 'mistake')]
  if (r.hintsUsed > 0) parts.push(plural(r.hintsUsed, 'hint'))
  if (r.dailyDay !== null && r.streak >= 2) parts.push(`🔥 ${r.streak}-day streak`)
  return `${title}\n${parts.join(' · ')}\n${r.url}`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

export interface ShareHost {
  share?: (data: { text: string }) => Promise<void>
  clipboard?: { writeText(text: string): Promise<void> }
}

export const canShare = (host: ShareHost): boolean =>
  typeof host.share === 'function' || typeof host.clipboard?.writeText === 'function'

/** The system share sheet where there is one (phones), otherwise the clipboard (most desktops). */
export async function shareResult(host: ShareHost, text: string): Promise<ShareOutcome> {
  if (typeof host.share === 'function') {
    try {
      await host.share({ text })
      return 'shared'
    } catch (e) {
      // Browsers reject with a DOMException; only its name is relied on, not its prototype chain.
      if ((e as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled'
      // NotAllowedError and friends: fall through to the clipboard.
    }
  }
  if (typeof host.clipboard?.writeText === 'function') {
    try {
      await host.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
