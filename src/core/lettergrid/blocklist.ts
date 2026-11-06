/**
 * Words that must never be a Seed Word: slurs and swear words. They stay playable (CONTEXT.md);
 * this list is used only to exclude Seed Word candidates. Lowercase a-z only.
 *
 * The list is frozen with the Word List version: changing it changes which Seed Words a given
 * date can draw, so it is a new version, not an edit.
 */
export const OFFENSIVE_WORDS: readonly string[] = [
  // swear words
  'ass', 'asshole', 'bastard', 'bitch', 'bollocks', 'bugger', 'cock', 'crap', 'cum', 'cunt',
  'damn', 'dick', 'dildo', 'douche', 'fag', 'fuck', 'goddam', 'hell', 'horny', 'jerk', 'jizz',
  'piss', 'prick', 'pussy', 'screw', 'shag', 'shit', 'slut', 'tit', 'tits', 'twat', 'wank',
  'whore', 'arse', 'bloody', 'balls', 'boner', 'butt', 'clit', 'dyke', 'turd', 'tosser',
  'wanker', 'knob', 'minge', 'nads', 'porn', 'rape', 'rapist', 'sex', 'sexy', 'smut',
  // slurs
  'chink', 'coon', 'dago', 'darkie', 'fagot', 'faggot', 'gook', 'gyp', 'gypsy', 'homo', 'jap',
  'kike', 'kraut', 'negro', 'nigger', 'nigga', 'paki', 'polack', 'queer', 'redskin', 'retard',
  'sambo', 'shemale', 'spic', 'spick', 'tranny', 'wetback', 'wog', 'wop', 'yid', 'cripple',
  'spastic', 'mongoloid', 'halfbreed', 'injun', 'gringo', 'honky', 'cracker', 'nazi', 'raghead',
  'towelhead', 'beaner', 'coolie', 'eskimo', 'lesbo', 'pansy', 'sodomite',
  'midget', 'cretin', 'moron', 'imbecile', 'spaz', 'mong', 'gimp', 'jackass', 'dumbass', 'badass',
  'bullshit', 'dickhead', 'shithead', 'dipshit', 'spunk', 'slag', 'booby', 'boob', 'boobs', 'skank',
  'pimp', 'hooker', 'sod', 'sodding', 'git', 'prat', 'pillock', 'berk', 'bint', 'tart', 'slapper',
  'floozy', 'hussy', 'harlot', 'trollop', 'bimbo', 'nympho', 'hoe', 'bonk', 'bugger',
  // anatomical, sexual
  'penis', 'vagina', 'anus', 'anal', 'orgasm', 'semen', 'sperm', 'muff', 'testicle', 'scrotum',
  'rectum', 'vulva', 'phallus', 'erection', 'erotic', 'incest', 'lust', 'nude', 'nipple', 'fetish',
  'gonad', 'rimjob', 'lube',
]

/** Coarse stems: a word containing one of these is out, so compounds (bullshit, dickhead) are caught. */
const COARSE_STEMS = [
  'fuck', 'shit', 'cunt', 'twat', 'whore', 'wank', 'bitch', 'slut', 'nigg', 'bollock', 'dick', 'piss',
  'prick', 'jackass', 'dumbass',
] as const

const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y'] as const

const BLOCKED = new Set(OFFENSIVE_WORDS)

/** True for a blocklisted word or a plain inflection of one (cocks, fucking, shitty, damned). */
export function isOffensive(word: string): boolean {
  if (COARSE_STEMS.some((stem) => word.includes(stem))) return true
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix)) continue
    const stem = suffix === '' ? word : word.slice(0, word.length - suffix.length)
    if (BLOCKED.has(stem)) return true
    // Doubled final consonant before a vowel suffix: shitting -> shit, dummer-style forms.
    if (suffix !== '' && suffix !== 's' && stem.length > 2 && stem.at(-1) === stem.at(-2) && BLOCKED.has(stem.slice(0, -1))) {
      return true
    }
    // Dropped silent e: raping -> rape.
    if ((suffix === 'ing' || suffix === 'ed' || suffix === 'er') && BLOCKED.has(`${stem}e`)) return true
  }
  // Consonant+y words inflect through i: pussy -> pussies, pansy -> pansied.
  const ied = /^(.*[^aeiou])i(es|ed|er|ers|est)$/.exec(word)
  if (ied && BLOCKED.has(`${ied[1]}y`)) return true
  return false
}
