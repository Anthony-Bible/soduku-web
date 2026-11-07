import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { dayFromYMD, type Difficulty } from '../core'
import { lettergridShareText, shareResult, shareText, type ShareHost } from './share'

const URL = 'https://sudoku.anthony.bible'
const difficulty = fc.constantFrom<Difficulty>('easy', 'medium', 'hard', 'expert')
const input = fc.record({
  difficulty,
  seconds: fc.nat(36_000),
  mistakes: fc.nat(50),
  hintsUsed: fc.nat(10),
  dailyDay: fc.option(fc.integer({ min: dayFromYMD(2024, 1, 1), max: dayFromYMD(2030, 12, 31) }), { nil: null }),
  streak: fc.nat(400),
  url: fc.constant(URL),
})

describe('shareText', () => {
  it('matches the agreed layout for a Daily Puzzle and an ordinary Game', () => {
    const nov2 = dayFromYMD(2026, 11, 2)
    expect(
      shareText({ difficulty: 'hard', seconds: 754, mistakes: 0, hintsUsed: 0, dailyDay: nov2, streak: 3, url: URL }),
    ).toBe(`Sudoku · Daily Puzzle Nov 2 · Hard\n⏱ 12:34 · 0 mistakes · 🔥 3-day streak\n${URL}`)
    expect(
      shareText({ difficulty: 'expert', seconds: 1082, mistakes: 1, hintsUsed: 2, dailyDay: null, streak: 9, url: URL }),
    ).toBe(`Sudoku · Expert\n⏱ 18:02 · 1 mistake · 2 hints\n${URL}`)
  })

  it('always has three lines and ends with the link', () => {
    fc.assert(
      fc.property(input, (r) => {
        const lines = shareText(r).split('\n')
        expect(lines).toHaveLength(3)
        expect(lines[2]).toBe(URL)
      }),
    )
  })

  it('mentions hints only when used, and the Streak only for a Daily Puzzle of 2+ days', () => {
    fc.assert(
      fc.property(input, (r) => {
        const t = shareText(r)
        expect(/\bhints?\b/.test(t)).toBe(r.hintsUsed > 0)
        expect(t.includes('streak')).toBe(r.dailyDay !== null && r.streak >= 2)
        expect(t.includes('Daily Puzzle')).toBe(r.dailyDay !== null)
      }),
    )
  })
})

// What a real share sheet rejects with, plus a bare object for engines whose DOMException isn't an Error.
const abort = () => new DOMException('cancelled', 'AbortError')

describe('shareResult', () => {
  it('uses the share sheet when there is one', async () => {
    const sent: string[] = []
    const host: ShareHost = { share: async ({ text }) => void sent.push(text) }
    expect(await shareResult(host, 'hi')).toBe('shared')
    expect(sent).toEqual(['hi'])
  })

  it('does nothing more when the player closes the share sheet', async () => {
    let copied = false
    const host: ShareHost = {
      share: () => Promise.reject(abort()),
      clipboard: { writeText: async () => void (copied = true) },
    }
    expect(await shareResult(host, 'hi')).toBe('cancelled')
    expect(await shareResult({ ...host, share: () => Promise.reject({ name: 'AbortError' }) }, 'hi')).toBe('cancelled')
    expect(copied).toBe(false)
  })

  it('falls back to the clipboard without a share sheet, or when sharing is refused', async () => {
    const copied: string[] = []
    const clipboard = { writeText: async (t: string) => void copied.push(t) }
    expect(await shareResult({ clipboard }, 'a')).toBe('copied')
    expect(await shareResult({ share: () => Promise.reject(new Error('no')), clipboard }, 'b')).toBe('copied')
    expect(copied).toEqual(['a', 'b'])
  })

  it('reports a failure when nothing works', async () => {
    expect(await shareResult({}, 'x')).toBe('failed')
    expect(await shareResult({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } }, 'x')).toBe('failed')
  })
})

describe('lettergridShareText', () => {
  const lg = fc.record({
    day: fc.integer({ min: dayFromYMD(2024, 1, 1), max: dayFromYMD(2030, 12, 31) }),
    plays: fc.array(fc.option(fc.nat(200), { nil: null }), { minLength: 6, maxLength: 6 }),
    score: fc.nat(1200),
    stars: fc.integer({ min: 0, max: 3 }),
    streak: fc.nat(400),
    url: fc.constant(URL),
  })

  it('has the title, the score line, the optional streak line and the url, in that order', () => {
    fc.assert(
      fc.property(lg, (r) => {
        const lines = lettergridShareText(r).split('\n')
        expect(lines[0]).toMatch(/^Lettergrid · Daily Puzzle \w+ \d+$/)
        expect(lines[1]).toBe(
          `${r.plays.map((p) => p ?? '↺').join(' · ')} = ${r.score}${r.stars ? ` ${'★'.repeat(r.stars)}` : ''}`,
        )
        expect(lines.at(-1)).toBe(URL)
        const streakLines = lines.filter((l) => l.includes('streak'))
        expect(streakLines).toEqual(r.streak >= 2 ? [`🔥 ${r.streak}-day streak`] : [])
        expect(lines).toHaveLength(3 + streakLines.length)
      }),
    )
  })

  it('matches the decided format, with a Swap shown as a loop arrow', () => {
    const day = dayFromYMD(2026, 11, 3)
    expect(
      lettergridShareText({ day, plays: [18, 31, null, 44, 22, 27], score: 142, stars: 2, streak: 3, url: URL }),
    ).toBe(`Lettergrid · Daily Puzzle Nov 3\n18 · 31 · ↺ · 44 · 22 · 27 = 142 ★★\n🔥 3-day streak\n${URL}`)
    expect(
      lettergridShareText({ day, plays: [18, 31, null, 44, 22, 27], score: 142, stars: 0, streak: 1, url: URL }),
    ).toBe(`Lettergrid · Daily Puzzle Nov 3\n18 · 31 · ↺ · 44 · 22 · 27 = 142\n${URL}`)
  })

  it('never carries a letter beyond the title and url', () => {
    fc.assert(
      fc.property(lg, (r) => {
        const body = lettergridShareText(r).split('\n').slice(1, -1).filter((l) => !l.includes('streak')).join('\n')
        expect(body).not.toMatch(/[A-Za-z]/)
      }),
    )
  })
})
