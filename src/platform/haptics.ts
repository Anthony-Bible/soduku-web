import type { Haptic } from '../core'

const PATTERNS: Record<Haptic, number | number[]> = {
  light: 8,
  medium: 18,
  error: [50, 40, 50],
  success: [12, 40, 12],
}

/** Vibrates where the browser supports it (Android Chrome); a no-op elsewhere, e.g. iOS Safari. */
export function playHaptics(haptics: readonly Haptic[]): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    const pattern = haptics.flatMap((h, i) => {
      const p = PATTERNS[h]
      const parts = Array.isArray(p) ? p : [p]
      return i === 0 ? parts : [60, ...parts]
    })
    if (pattern.length > 0) navigator.vibrate(pattern)
  } catch {
    // Haptics are best-effort.
  }
}
