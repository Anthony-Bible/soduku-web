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
