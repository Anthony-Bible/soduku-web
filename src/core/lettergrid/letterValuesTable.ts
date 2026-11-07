import { LETTER_VALUES_V1 } from './letterValuesV1'

/**
 * Frozen letter values per Word List version. A Daily is scored against the values of the version
 * it was published with (ADR 0003), so a new version adds an entry and never edits an old one.
 */
export const LETTER_VALUES_BY_VERSION: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  1: LETTER_VALUES_V1,
}

export function letterValuesFor(version: number): Readonly<Record<string, number>> {
  const values = LETTER_VALUES_BY_VERSION[version]
  if (!values) throw new Error(`No letter values for Word List v${version}`)
  return values
}
