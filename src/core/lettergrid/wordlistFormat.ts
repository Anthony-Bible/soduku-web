/**
 * The Word List artifact: a sorted, front-coded text file.
 *
 *   line 1:    `lettergrid-wordlist <version> <source>`
 *   each word: one digit N (the length of the prefix shared with the previous word), then the
 *              rest of the word; a trailing `*` marks a Seed Word candidate.
 *
 * Words are lowercase a-z, 2..9 letters. Plain text so the CDN and the service worker compress it.
 */

export const MIN_WORD_LENGTH = 2
export const MAX_WORD_LENGTH = 9
export const MIN_SEED_LENGTH = 3
export const MAX_SEED_LENGTH = 7

const MAGIC = 'lettergrid-wordlist'

export interface WordListData {
  version: number
  /** Where the words came from (SCOWL release and parameters), for the record. */
  source: string
  /** Every accepted word, sorted. */
  words: string[]
  /** Seed Word candidates, a subset of `words`, sorted. */
  seeds: string[]
}

export function isValidWordShape(word: string): boolean {
  return word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH && /^[a-z]+$/.test(word)
}

export function encodeWordList(data: WordListData): string {
  const seeds = new Set(data.seeds)
  const words = [...new Set(data.words)].sort()
  for (const seed of seeds) {
    if (!words.includes(seed)) throw new Error(`Seed candidate "${seed}" is not in the Word List`)
  }
  const lines = [`${MAGIC} ${data.version} ${data.source}`]
  let prev = ''
  for (const word of words) {
    if (!isValidWordShape(word)) throw new Error(`Invalid word "${word}"`)
    let shared = 0
    while (shared < prev.length && shared < word.length && prev[shared] === word[shared]) shared++
    lines.push(`${shared}${word.slice(shared)}${seeds.has(word) ? '*' : ''}`)
    prev = word
  }
  return `${lines.join('\n')}\n`
}

export function decodeWordList(text: string): WordListData {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const header = lines.shift()?.split(' ') ?? []
  if (header[0] !== MAGIC) throw new Error('Not a Lettergrid Word List')
  const version = Number(header[1])
  if (!Number.isInteger(version)) throw new Error('Word List has no version')
  const words: string[] = []
  const seeds: string[] = []
  let prev = ''
  for (const line of lines) {
    const isSeed = line.endsWith('*')
    const body = isSeed ? line.slice(0, -1) : line
    if (!/^[0-9]/.test(body) || Number(body[0]) > prev.length) throw new Error(`Corrupt Word List entry "${line}"`)
    const word = prev.slice(0, Number(body[0])) + body.slice(1)
    if (!isValidWordShape(word) || word <= prev) throw new Error(`Corrupt Word List entry "${line}"`)
    words.push(word)
    if (isSeed) seeds.push(word)
    prev = word
  }
  return { version, source: header.slice(2).join(' '), words, seeds }
}
