/** Letter values: ours, derived from letter frequency in the Word List (rarer is worth more). */

export const MAX_LETTER_VALUE = 10

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'

/** Occurrences of each letter across every word. */
export function letterCounts(words: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries([...ALPHABET].map((c) => [c, 0]))
  for (const word of words) for (const c of word) counts[c]++
  return counts
}

/**
 * Maps frequency onto 1..MAX_LETTER_VALUE on a log scale: the most common letter is worth 1 and
 * the rarest MAX_LETTER_VALUE. Never decreases as a letter gets rarer.
 */
export function deriveLetterValues(words: readonly string[]): Record<string, number> {
  const counts = letterCounts(words)
  const nums = Object.values(counts).filter((n) => n > 0)
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  const span = Math.log(max / min) || 1
  return Object.fromEntries(
    [...ALPHABET].map((c) => {
      const n = counts[c]
      if (n === 0) return [c, MAX_LETTER_VALUE]
      return [c, 1 + Math.round(((MAX_LETTER_VALUE - 1) * Math.log(max / n)) / span)]
    }),
  )
}
