/** A cell position is its index 0...80, row-major. */
export type Position = number

export const rowOf = (p: Position): number => Math.floor(p / 9)
export const colOf = (p: Position): number => p % 9
export const boxOf = (p: Position): number => Math.floor(rowOf(p) / 3) * 3 + Math.floor(colOf(p) / 3)
export const positionAt = (row: number, col: number): Position => row * 9 + col

export const ALL_POSITIONS: readonly Position[] = Array.from({ length: 81 }, (_, i) => i)

export function sharesUnit(a: Position, b: Position): boolean {
  if (a === b) return false
  return rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b)
}

/** The 27 units (9 rows, 9 columns, 9 boxes) as arrays of positions. */
export const UNITS: readonly (readonly Position[])[] = (() => {
  const units: Position[][] = []
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => positionAt(r, c)))
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => positionAt(r, c)))
  for (let b = 0; b < 9; b++) {
    const unit: Position[] = []
    for (let r = Math.floor(b / 3) * 3; r < Math.floor(b / 3) * 3 + 3; r++)
      for (let c = (b % 3) * 3; c < (b % 3) * 3 + 3; c++) unit.push(positionAt(r, c))
    units.push(unit)
  }
  return units
})()

export const rowUnit = (p: Position): readonly Position[] => UNITS[rowOf(p)]
export const colUnit = (p: Position): readonly Position[] => UNITS[9 + colOf(p)]
export const boxUnit = (p: Position): readonly Position[] => UNITS[18 + boxOf(p)]

/** Every position sharing a row, column or box with `p` (excluding `p`). */
export const PEERS: readonly (readonly Position[])[] = ALL_POSITIONS.map((p) =>
  ALL_POSITIONS.filter((q) => sharesUnit(p, q)),
)
