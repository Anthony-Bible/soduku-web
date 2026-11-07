/** JSON with sorted keys, so equal values always compare equal as strings. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export const cmp = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0)

export function unionMap<T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>, pick: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(a)) out[k] = a[k]
  for (const k of Object.keys(b)) out[k] = Object.hasOwn(out, k) ? pick(out[k], b[k]) : b[k]
  return out
}

/** The slot that wins a conflict: newest `updatedAt`, then a cleared marker, then a stable tie-break. */
export function mergeSlots<S extends { readonly updatedAt: number; readonly game: unknown }>(a: S, b: S): S {
  const order =
    cmp(a.updatedAt, b.updatedAt) ||
    cmp(a.game === null ? 1 : 0, b.game === null ? 1 : 0) ||
    (stableStringify(a.game) <= stableStringify(b.game) ? -1 : 1)
  return order >= 0 ? a : b
}

// MARK: Slots (Games in progress, last-writer-wins per key), shared by Sudoku's and Lettergrid's documents

interface AnySlot {
  readonly updatedAt: number
  readonly game: { readonly id: string } | null
}
type Live<S extends AnySlot> = S & { game: NonNullable<S['game']> }

export const dailySlotKey = (day: number): string => `daily.${day}`
/** The day of a `daily.<day>` slot key, or null for any other key. */
export const dailySlotDay = (key: string): number | null => (key.startsWith('daily.') ? Number(key.slice(6)) : null)

/** The Game that can be continued from a slot. A slot whose Game is already finished counts as cleared. */
export function liveSlotIn<S extends AnySlot>(slots: Readonly<Record<string, S>>, key: string, finished: (id: string) => boolean): Live<S> | null {
  const s = slots[key]
  return s && s.game !== null && !finished(s.game.id) ? (s as Live<S>) : null
}

/**
 * Writes a slot unless it already holds something newer. A finished Game never comes back, even from a stale
 * open screen. Returns `slots` itself when nothing changes.
 */
export function writeSlot<S extends AnySlot>(slots: Readonly<Record<string, S>>, key: string, slot: S, finished: (id: string) => boolean): Readonly<Record<string, S>> {
  const existing = slots[key]
  if (existing && existing.updatedAt > slot.updatedAt) return slots
  if (slot.game !== null && finished(slot.game.id)) return slots
  return { ...slots, [key]: slot }
}

/** The newest slot write, or `from` if that is newer. */
export function newestSlotWrite(slots: Readonly<Record<string, AnySlot>>, from: number): number {
  let t = from
  for (const s of Object.values(slots)) if (s.updatedAt > t) t = s.updatedAt
  return t
}

/** Pulls every slot write back to at most `maxTime`. */
export function clampSlots<S extends AnySlot>(slots: Readonly<Record<string, S>>, maxTime: number): Record<string, S> {
  const out: Record<string, S> = {}
  for (const [key, slot] of Object.entries(slots)) out[key] = slot.updatedAt > maxTime ? { ...slot, updatedAt: maxTime } : slot
  return out
}

/**
 * Drops slots that can no longer matter: one untouched since before `cutoff`, and a daily slot whose day is
 * solved (a solved day never reopens). Both only become more true as documents merge, so pruning commutes with merging.
 */
export function pruneSlots<S extends AnySlot>(slots: Readonly<Record<string, S>>, cutoff: number, solvedDay: (day: number) => boolean): Record<string, S> {
  const out: Record<string, S> = {}
  for (const [key, slot] of Object.entries(slots)) {
    const day = dailySlotDay(key)
    if (slot.updatedAt < cutoff || (day !== null && solvedDay(day))) continue
    out[key] = slot
  }
  return out
}
