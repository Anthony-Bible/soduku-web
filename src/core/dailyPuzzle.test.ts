import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { serialize } from './board'
import { dayFromYMD } from './calendarDay'
import { dailyDifficulty, dailyPuzzle, dailySeed, GENERATOR_VERSION } from './dailyPuzzle'
import { arbDay } from './fixtures'

describe('Daily Puzzle', () => {
  test('difficulty follows the weekday: Mon-Tue Easy, Wed-Thu Medium, Fri-Sat Hard, Sun Expert', () => {
    const monday = dayFromYMD(2026, 11, 2)
    const expected = ['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert']
    expected.forEach((d, i) => expect(dailyDifficulty(monday + i)).toBe(d))
  })

  test('difficulty depends on the weekday alone', () => {
    fc.assert(fc.property(arbDay, (d) => { expect(dailyDifficulty(d)).toBe(dailyDifficulty(d + 7)) }))
  })

  test('seeds are stable and distinct for distinct dates', () => {
    const base = dayFromYMD(2026, 1, 1)
    const seen = new Set<bigint>()
    for (let i = 0; i < 3650; i++) seen.add(dailySeed(base + i))
    expect(seen.size).toBe(3650)
  })

  test('the same day always produces the same puzzle, at its weekday difficulty', () => {
    const day = dayFromYMD(2026, 10, 31)
    const a = dailyPuzzle(day)
    expect(dailyPuzzle(day)).toEqual(a)
    expect(a.difficulty).toBe(dailyDifficulty(day))
  })

  // Guards ADR 0001: if this fails, the generator changed and every past Daily Puzzle changed with it.
  // Recorded from generator version 1. Do not edit; add a new version instead.
  test('generator version 1 is frozen', () => {
    const day = dayFromYMD(2026, 10, 31) // a Saturday: Hard
    expect(GENERATOR_VERSION).toBe(1n)
    expect(dailySeed(day)).toBe(3_294_528_996_317_247_562n)
    expect(serialize(dailyPuzzle(day).puzzle)).toBe(
      '280100570070090200640000008060010000000048010800700060000450000400060100030207600',
    )
    expect(serialize(dailyPuzzle(day).solution)).toBe(
      '289134576573896241641572938967315482352648719814729365796451823428963157135287694',
    )
  })
})
