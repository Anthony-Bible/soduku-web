/**
 * The newest Par solver version. A changed solver is a new version picked by date (see
 * parSolverVersionFor in daily.ts), so past days keep the Par they were published with (ADR 0003).
 */
export const PAR_SOLVER_VERSION = 1

/** Par tiers as shares of the greedy solver's score: one, two and three stars. Frozen for v1. */
export const PAR_SHARES_V1 = [0.6, 0.8, 0.95] as const

/** Frozen Par shares per solver version; a new solver adds an entry and never edits an old one. */
export const PAR_SHARES_BY_VERSION: Readonly<Record<number, readonly [number, number, number]>> = {
  1: PAR_SHARES_V1,
}

export type ParTiers = [one: number, two: number, three: number]

export interface Par {
  solverVersion: number
  /** What the deterministic greedy solver scores on this day's Tile Run. */
  greedyScore: number
  tiers: ParTiers
}

/** Strictly ascending, positive tiers, even when the greedy score is tiny. */
export function parFromGreedy(greedyScore: number, solverVersion: number): Par {
  const shares = PAR_SHARES_BY_VERSION[solverVersion]
  if (!shares) throw new Error(`No Par shares for solver v${solverVersion}`)
  const one = Math.max(1, Math.floor(greedyScore * shares[0]))
  const two = Math.max(one + 1, Math.floor(greedyScore * shares[1]))
  const three = Math.max(two + 1, Math.floor(greedyScore * shares[2]))
  return { solverVersion, greedyScore, tiers: [one, two, three] }
}

/** 0 to 3 stars: how many Par tiers `score` reaches. Never decides whether a Daily is solved. */
export function starsFor(score: number, par: Par): 0 | 1 | 2 | 3 {
  return par.tiers.filter((t) => score >= t).length as 0 | 1 | 2 | 3
}
