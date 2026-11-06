/** "m:ss" or "h:mm:ss". */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "3 minutes 12 seconds" for screen readers. */
export function accessibleElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`)
  if (s > 0 || parts.length === 0) parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`)
  return parts.join(' ')
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function relativeTime(now: number, then: number): string {
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 45) return 'just now'
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return unit(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return unit(hours, 'hour')
  return unit(Math.floor(hours / 24), 'day')
}

export const starsText = (stars: number): string => '★'.repeat(stars)
export const starsWords = (stars: number): string => (stars === 0 ? 'no stars' : `${stars} ${stars === 1 ? 'star' : 'stars'}`)
