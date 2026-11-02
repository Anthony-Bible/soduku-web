const MASK = 0xffffffffffffffffn

/** SplitMix64: deterministic for a given seed, exact 64-bit arithmetic via BigInt. */
export class SeededRandom {
  private state: bigint

  constructor(seed: bigint) {
    const s = seed & MASK
    this.state = s === 0n ? 0x9e3779b97f4a7c15n : s
  }

  /** The next 64-bit value. */
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK
    return z ^ (z >> 31n)
  }

  /** An integer in 0..<n. */
  nextBelow(n: number): number {
    return Number(this.next() % BigInt(n))
  }

  /** Fisher-Yates, in place. The draw order is part of the frozen generator contract. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextBelow(i + 1)
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }
}

/** The SplitMix64 finalizer. */
export function mix64(input: bigint): bigint {
  let z = input & MASK
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK
  return z ^ (z >> 31n)
}

export const add64 = (a: bigint, b: bigint): bigint => (a + b) & MASK

/** A fresh random 64-bit seed. Uses Web Crypto when present. */
export function randomSeed(): bigint {
  const g = globalThis as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(a: T) => T } }
  if (g.crypto?.getRandomValues) {
    const words = g.crypto.getRandomValues(new Uint32Array(2))
    return (BigInt(words[0]) << 32n) | BigInt(words[1])
  }
  return (BigInt(Math.floor(Math.random() * 2 ** 32)) << 32n) | BigInt(Math.floor(Math.random() * 2 ** 32))
}
