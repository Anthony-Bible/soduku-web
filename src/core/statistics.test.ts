import { describe, expect, it } from 'vitest'
import { emptyStatistics, recordWin, winRatePercent } from './statistics'

describe('recordWin after a reset', () => {
  it('never lets won exceed played', () => {
    const { stats } = recordWin(emptyStatistics(), 'easy', 100)
    expect(stats.easy.won).toBeLessThanOrEqual(stats.easy.played)
    expect(winRatePercent(stats.easy)).toBeLessThanOrEqual(100)
  })
})
