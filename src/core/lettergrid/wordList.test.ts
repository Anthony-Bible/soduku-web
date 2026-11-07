import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { BLOCKED_WORDS, isOffensive, LDNOOBW_WORDS, OFFENSIVE_WORDS } from './blocklist'
import { extractAbbreviations, filterScowlWords, pickSeedCandidates } from './filter'
import { deriveLetterValues, letterCounts, MAX_LETTER_VALUE } from './letterValues'
import { letterValuesFor } from './letterValuesTable'
import { CURRENT_WORD_LIST_VERSION, parseWordList, wordListPath } from './wordList'
import {
  decodeWordList,
  encodeWordList,
  isValidWordShape,
  MAX_SEED_LENGTH,
  MIN_SEED_LENGTH,
} from './wordlistFormat'

const artifactText = readFileSync(resolve(__dirname, '../../../public', wordListPath(CURRENT_WORD_LIST_VERSION)), 'utf8')
const data = decodeWordList(artifactText)
const list = parseWordList(artifactText)
const wordSet = new Set(data.words)

const wordArb = fc.stringMatching(/^[a-z]{2,9}$/)

// v1 is frozen (ADR 0003): any edit to the artifact changes this hash and must be a new version.
const V1_SHA256 = '45896b9089cbb3f8d4246e26cc12895b94b382d0910bd8e126455df38b5e3674'

describe('the shipped Word List artifact', () => {
  it('is the frozen v1, byte for byte', () => {
    expect(createHash('sha256').update(artifactText).digest('hex')).toBe(V1_SHA256)
    expect(data.words.length).toBe(53671)
  })

  it('carries the current version and is stable across loads', () => {
    expect(list.version).toBe(CURRENT_WORD_LIST_VERSION)
    expect(parseWordList(artifactText).version).toBe(list.version)
    expect(encodeWordList(data)).toBe(artifactText)
  })

  it('accepts every word it lists, in any case', () => {
    for (const w of data.words) {
      expect(list.isWord(w)).toBe(true)
      expect(list.isWord(w.toUpperCase())).toBe(true)
    }
  })

  it('accepts both American and British spellings', () => {
    for (const w of ['color', 'colour', 'organize', 'organise', 'center', 'centre', 'gray', 'grey']) {
      expect(list.isWord(w)).toBe(true)
    }
  })

  it('rejects generated strings that are not in the list', () => {
    fc.assert(
      fc.property(wordArb, (w) => {
        fc.pre(!wordSet.has(w))
        expect(list.isWord(w)).toBe(false)
      }),
    )
  })

  it('rejects out-of-shape input', () => {
    for (const w of ['', 'a', "don't", 'abcdefghij', 'zzzzzz', 'x-ray', 'Paris1']) {
      expect(list.isWord(w)).toBe(false)
    }
  })

  it('has only well-shaped words, no abbreviations like kg or tsp', () => {
    expect(data.words.every(isValidWordShape)).toBe(true)
    const abbreviations = 'kg cf tsp mfg bldg hwy fwy hgwy pkwy qty wkly yrs phys syn govt dept assn asst natl approx misc etc adj adv conj pron abbr ibid viz cont esp pres dist div avg ave'
    for (const abbr of abbreviations.split(' ')) expect(list.isWord(abbr), abbr).toBe(false)
  })

  it('keeps words whose only vowel is y', () => {
    for (const w of ['cry', 'gym', 'myth', 'rhythm', 'fly', 'sky', 'why', 'by', 'my', 'hymn']) {
      expect(list.isWord(w), w).toBe(true)
    }
  })

  it('keeps Seed Word candidates 3..7 letters, in the list, and off the blocklist', () => {
    expect(list.seedCandidates.length).toBeGreaterThan(1000)
    for (const s of list.seedCandidates) {
      expect(s.length).toBeGreaterThanOrEqual(MIN_SEED_LENGTH)
      expect(s.length).toBeLessThanOrEqual(MAX_SEED_LENGTH)
      expect(wordSet.has(s)).toBe(true)
      expect(isOffensive(s)).toBe(false)
    }
    const pool = new Set(list.seedCandidates)
    for (const bad of BLOCKED_WORDS) expect(pool.has(bad)).toBe(false)
  })

  it('keeps known slurs, swear words and crude terms out of the Seed Word pool', () => {
    const pool = new Set(list.seedCandidates)
    const offensive =
      'jackass sod sodding slag midget cretin moron spunk booby boobs skank pimp hooker penis vagina anus anal orgasm semen muff ' +
      'dumbass badass bullshit dickhead shithead dipshit fuck shit bitch cunt whore slut twat wank bastard nigger faggot retard ' +
      'cocks fucking shitty damned pussies pansies orgy orgies kinky pervert molest vaginal vaginae moronic nudest ' +
      'cockier jerkier lustier'
    for (const w of offensive.split(' ')) expect(pool.has(w), w).toBe(false)
  })

  it('still lets offensive words be played', () => {
    const playable = OFFENSIVE_WORDS.filter((w) => wordSet.has(w))
    expect(playable.length).toBeGreaterThan(10)
  })

  it('is small enough to ship (under 600 KB)', () => {
    expect(Buffer.byteLength(artifactText)).toBeLessThan(600 * 1024)
  })
})

describe('the front-coded format', () => {
  it('round-trips any set of words and seed flags', () => {
    fc.assert(
      fc.property(fc.uniqueArray(wordArb, { maxLength: 60 }), fc.nat(), (words, mask) => {
        const seeds = words.filter((_, i) => (mask >> (i % 20)) & 1)
        const back = decodeWordList(encodeWordList({ version: 7, source: 'test src', words, seeds }))
        expect(back.words).toEqual([...words].sort())
        expect(back.seeds).toEqual([...seeds].sort())
        expect(back.version).toBe(7)
        expect(back.source).toBe('test src')
      }),
    )
  })

  it('rejects files that are not Word Lists', () => {
    expect(() => decodeWordList('hello\n0abc\n')).toThrow()
    expect(() => decodeWordList('lettergrid-wordlist x src\n')).toThrow()
  })

  it('rejects corrupt entries instead of decoding them to another word', () => {
    const head = 'lettergrid-wordlist 1 src\n'
    expect(() => decodeWordList(`${head}0cat\nxdog\n`)).toThrow() // prefix is not a digit
    expect(() => decodeWordList(`${head}0cat\n9dog\n`)).toThrow() // prefix longer than the previous word
    expect(() => decodeWordList(`${head}0dog\n0cat\n`)).toThrow() // not ascending
    expect(() => decodeWordList(`${head}0dog\n0dog\n`)).toThrow() // duplicate
  })
})

describe('filterScowlWords', () => {
  it('keeps only lowercase a-z words of 2..9 letters, sorted and unique', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 12 })), (lines) => {
        const out = filterScowlWords(lines)
        expect(out).toEqual([...out].sort())
        expect(new Set(out).size).toBe(out.length)
        expect(out.every(isValidWordShape)).toBe(true)
      }),
    )
  })

  it('drops proper nouns, initialisms, possessives and abbreviations', () => {
    expect(filterScowlWords(['Paris', 'NASA', "dog's", 'kg', 'tsp', 'dog', 'to', 'a', 'abcdefghij'])).toEqual(['dog', 'to'])
  })

  it('drops vowelless leftovers and source-tagged abbreviations, but not real words', () => {
    expect(filterScowlWords(['qty', 'hwy', 'govt', 'cry', 'gym', 'brr', 'dept', 'dog'], new Set(['dept']))).toEqual([
      'brr', 'cry', 'dog', 'govt', 'gym',
    ])
  })
})

describe('extractAbbreviations', () => {
  const pre = [
    '60 [12dicts]: _: qty. <abbr>',
    '60 [12dicts]: _~: qty <abbr>',
    '40 [3esl] 50 [12dicts]: rep <n>: reps',
    '80 [moby]: rep. <abbr>',
    '60 [12dicts] 70 [moby]: _~: ave <abbr>',
    '70 [moby] 80 [enable]: -ave <n>: aves',
    '85 [ukacd]: !div <n>: divs',
    '60 [12dicts]: _~: div <abbr>',
    '60 [12dicts]: ABA <n/abbr>',
    '# comment <abbr>',
  ]

  it('finds words only ever abbreviations at size 60, keeping ordinary words', () => {
    expect([...extractAbbreviations(pre)].sort()).toEqual(['ave', 'div', 'qty'])
  })
})

// Set LETTERGRID_SCOWL_60, LETTERGRID_SCOWL_35 and LETTERGRID_SCOWL_PRE to the build inputs (README) to run this.
describe('the artifact against its source', () => {
  const big = process.env.LETTERGRID_SCOWL_60
  const common = process.env.LETTERGRID_SCOWL_35
  const pre = process.env.LETTERGRID_SCOWL_PRE
  const ready = Boolean(big && common && pre && existsSync(big) && existsSync(common) && existsSync(pre))
  it.skipIf(!ready)('is what the build filter makes of the SCOWL exports', () => {
    const lines = (p: string | undefined) => readFileSync(p as string, 'utf8').split('\n')
    const abbr = extractAbbreviations(lines(pre))
    expect(filterScowlWords(lines(big), abbr)).toEqual(data.words)
    expect(pickSeedCandidates(data.words, new Set(filterScowlWords(lines(common), abbr)))).toEqual(data.seeds)
  })
})

describe('Seed Word candidates', () => {
  it('never intersect the blocklist, whatever the input', () => {
    fc.assert(
      fc.property(fc.array(wordArb, { maxLength: 40 }), (extra) => {
        const words = filterScowlWords([...extra, ...BLOCKED_WORDS, 'house'])
        const pool = pickSeedCandidates(words, new Set(words))
        for (const w of pool) expect(BLOCKED_WORDS).not.toContain(w)
        expect(pool.every((w) => !isOffensive(w))).toBe(true)
      }),
    )
  })

  it('excludes plain inflections of blocklisted words', () => {
    for (const w of ['fucking', 'shitty', 'damned', 'bitches', 'raping', 'bullshit', 'dickhead', 'jackass', 'pussies', 'pansies',
      'cockier', 'jerkiest', 'nudest', 'moronic', 'vaginal', 'vaginae']) {
      expect(isOffensive(w)).toBe(true)
    }
    for (const w of ['house', 'class', 'assist', 'hello']) expect(isOffensive(w)).toBe(false)
  })
})

describe('the shipped Seed Word pool and inflections', () => {
  /** Regular inflections a Seed Word could take from a blocklisted word. */
  function inflections(w: string): string[] {
    const last = w.at(-1) as string
    const out = [w, `${w}s`, `${w}es`, `${w}ed`, `${w}er`, `${w}ers`, `${w}ing`, `${w}y`, `${w}${last}ed`, `${w}${last}ing`, `${w}${last}er`, `${w}${last}y`]
    out.push(`${w}ier`, `${w}iest`, `${w}est`, `${w}ic`, `${w}al`)
    if (last === 'e') out.push(`${w.slice(0, -1)}ing`, `${w.slice(0, -1)}ed`, `${w.slice(0, -1)}er`, `${w.slice(0, -1)}est`)
    if (last === 'a') out.push(`${w}l`, `${w}e`)
    if (last === 'y' && !'aeiou'.includes(w.at(-2) ?? 'a')) {
      const base = w.slice(0, -1)
      out.push(`${base}ies`, `${base}ied`, `${base}ier`, `${base}iest`)
    }
    return out
  }

  it('holds no regular inflection of any blocked word', () => {
    const pool = new Set(list.seedCandidates)
    for (const bad of BLOCKED_WORDS) {
      for (const form of inflections(bad)) expect(pool.has(form), form).toBe(false)
    }
  })
})

describe('letter values', () => {
  const LETTER_VALUES = letterValuesFor(CURRENT_WORD_LIST_VERSION)

  it('stay inside 1..MAX and never rise for a more common letter', () => {
    const counts = letterCounts(data.words)
    const letters = Object.keys(counts)
    for (const a of letters) {
      expect(LETTER_VALUES[a]).toBeGreaterThanOrEqual(1)
      expect(LETTER_VALUES[a]).toBeLessThanOrEqual(MAX_LETTER_VALUE)
      for (const b of letters) {
        if (counts[a] > counts[b]) expect(LETTER_VALUES[a]).toBeLessThanOrEqual(LETTER_VALUES[b])
      }
    }
  })

  it('match the table frozen for this Word List version', () => {
    expect(deriveLetterValues(data.words)).toEqual(letterValuesFor(list.version))
  })

  it('are unknown for a version that was never built', () => {
    expect(() => letterValuesFor(999)).toThrow()
  })

  it('score the most common letter lowest and the rarest highest', () => {
    expect(LETTER_VALUES.e).toBe(1)
    expect(Math.max(...Object.values(LETTER_VALUES))).toBe(MAX_LETTER_VALUE)
  })
})

describe('the blocklist', () => {
  it('includes every single word from LDNOOBW alongside our own list', () => {
    expect(LDNOOBW_WORDS.length).toBeGreaterThan(200)
    for (const w of [...LDNOOBW_WORDS, ...OFFENSIVE_WORDS]) expect(isOffensive(w), w).toBe(true)
  })
})
