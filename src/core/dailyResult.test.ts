import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from './difficulty'
import { dailyResult, emptySyncDoc, mergeDocs, type GameRecord, type SyncDoc } from './syncDoc'

const DAY = 20_000
const record = fc.record({
  id: fc.uuid(),
  difficulty: fc.constantFrom(...DIFFICULTIES),
  startedAt: fc.nat(),
  dailyDay: fc.option(fc.constantFrom(DAY, DAY - 1), { nil: null }),
  wonSeconds: fc.option(fc.nat(10_000), { nil: null }),
  mistakes: fc.option(fc.nat(20), { nil: null }),
  hintsUsed: fc.option(fc.nat(5), { nil: null }),
}) satisfies fc.Arbitrary<GameRecord>

const docOf = (games: GameRecord[]): SyncDoc => ({
  ...emptySyncDoc(),
  games: Object.fromEntries(games.map((g) => [g.id, g])),
})

const complete = (g: GameRecord) =>
  g.dailyDay === DAY && g.wonSeconds !== null && g.mistakes !== null && g.hintsUsed !== null

describe('dailyResult', () => {
  it("is that day's fastest win with details, and none when there isn't one", () => {
    fc.assert(
      fc.property(fc.uniqueArray(record, { maxLength: 12, selector: (g) => g.id }), (games) => {
        const wins = games.filter(complete)
        const r = dailyResult(docOf(games), DAY)
        if (wins.length === 0) {
          expect(r).toBeNull()
          return
        }
        expect(r).not.toBeNull()
        expect(r!.seconds).toBe(Math.min(...wins.map((g) => g.wonSeconds!)))
        // It is one of that day's wins, never a mix of two.
        expect(wins.some((g) => g.difficulty === r!.difficulty && g.wonSeconds === r!.seconds && g.mistakes === r!.mistakes && g.hintsUsed === r!.hintsUsed)).toBe(true)
      }),
    )
  })

  it('gives the same answer on every device once their documents are merged', () => {
    fc.assert(
      fc.property(fc.uniqueArray(record, { maxLength: 8, selector: (g) => g.id }), fc.uniqueArray(record, { maxLength: 8, selector: (g) => g.id }), (a, b) => {
        const ab = mergeDocs(docOf(a), docOf(b))
        const ba = mergeDocs(docOf(b), docOf(a))
        expect(dailyResult(ab, DAY)).toEqual(dailyResult(ba, DAY))
      }),
    )
  })
})
