import { decodeWordList, type WordListData } from './wordlistFormat'

/** The Word List version new Lettergrid Daily Puzzles are published with. */
export const CURRENT_WORD_LIST_VERSION = 1

/** Where a Word List version is served from, relative to the app's base URL. */
export function wordListPath(version: number): string {
  return `lettergrid/wordlist-v${version}.txt`
}

/** A loaded, version-tagged Word List. */
export interface WordList {
  readonly version: number
  readonly size: number
  /** True if `word` (any case) is accepted. */
  isWord(word: string): boolean
  /** Seed Word candidates (never offensive), in a fixed order, so a seeded pick is stable. */
  readonly seedCandidates: readonly string[]
}

export function createWordList(data: WordListData): WordList {
  const set = new Set(data.words)
  return {
    version: data.version,
    size: set.size,
    isWord: (word) => set.has(word.toLowerCase()),
    seedCandidates: data.seeds,
  }
}

export function parseWordList(text: string): WordList {
  return createWordList(decodeWordList(text))
}
