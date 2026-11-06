import { isOffensive } from './blocklist'
import { isValidWordShape, MAX_SEED_LENGTH, MIN_SEED_LENGTH } from './wordlistFormat'

/** Allowed words with no a, e, i, o or u; any other such word is an abbreviation the source missed. */
const VOWELLESS_WORDS = new Set(
  ('brr hmm nth psst shh sh ' +
    // y is the only vowel: listed outright, so abbreviations like qty and hwy cannot slip in
    'by cry crypt crypts cyst cysts dry dryly drys fly flyby flybys fry glyph glyphs gym gyms gyp gyps ' +
    'gypsy hymn hymns lymph lynch lynx my myrrh myth myths nymph nymphs ply pry psych psychs pygmy pyx ' +
    'rhythm rhythms shy shyly sky sly slyly spry spryly spy sty sylph sylphs sync syncs synth synths ' +
    'thy try tryst trysts why whys wry wryly').split(' '),
)

/** Two-letter words kept from the source; the rest of its lowercase pairs are abbreviations (kg, cf). */
const TWO_LETTER_WORDS = new Set(
  ('ad ah am an as at aw ax be by do eh em en er ex fa go ha he hi ho id if in is it la lo ma me mi mo ' +
    'mu my no nu of oh oi om on op or ow ox pa pi re sh so ta ti to uh um up us we ya ye yo').split(' '),
)

/** The size cut-off of the Word List: an entry above this level is not in the export. */
const SIZE = 60

/**
 * Lowercase words that ESDB (the SCOWL source, `data/scowl-pre.txt`) tags `abbr` and has no
 * ordinary entry for at or below size 60: hwy, qty, govt, etc. "rep" and "prof" stay, as real
 * words. Affix entries (`-ave`) and entries above the size cut-off do not count as real words.
 */
export function extractAbbreviations(preLines: Iterable<string>): Set<string> {
  const abbr = new Set<string>()
  const real = new Set<string>()
  for (const line of preLines) {
    if (line.startsWith('#')) continue
    const sep = line.indexOf(': ')
    if (sep < 0) continue
    let rest = line.slice(sep + 2).trimEnd()
    if (rest.startsWith('_~: ')) rest = rest.slice(4)
    else if (rest.startsWith('_: ')) rest = rest.slice(3)
    const m = /^(.*?) <([^>]*)>/.exec(rest)
    if (!m) continue
    const head = m[1].replace(/\.$/, '')
    if (!/^[a-z]+$/.test(head)) continue
    if (m[2].includes('abbr')) {
      abbr.add(head)
    } else if (Number(/^(\d+)/.exec(line)?.[1] ?? 0) <= SIZE) {
      real.add(head)
    }
  }
  for (const w of real) abbr.delete(w)
  return abbr
}

/**
 * Turns the lines of a SCOWL export into Word List words: lowercase a-z only, so proper nouns,
 * initialisms and possessives fall away; 2..9 letters; and abbreviations removed: those the
 * source tags (`abbreviations`, from extractAbbreviations) plus any vowelless leftovers.
 */
export function filterScowlWords(
  lines: Iterable<string>,
  abbreviations: ReadonlySet<string> = new Set(),
): string[] {
  const out = new Set<string>()
  for (const raw of lines) {
    const word = raw.trim()
    if (!isValidWordShape(word)) continue
    if (abbreviations.has(word)) continue
    if (word.length === 2 && !TWO_LETTER_WORDS.has(word)) continue
    if (!/[aeiou]/.test(word) && !VOWELLESS_WORDS.has(word)) continue
    out.add(word)
  }
  return [...out].sort()
}

/** Seed Word candidates: common words (`commonWords`) in the list, 3..7 letters, never offensive. */
export function pickSeedCandidates(words: readonly string[], commonWords: ReadonlySet<string>): string[] {
  return words.filter(
    (w) =>
      w.length >= MIN_SEED_LENGTH && w.length <= MAX_SEED_LENGTH && commonWords.has(w) && !isOffensive(w),
  )
}
