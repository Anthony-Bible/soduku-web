import { describe, expect, it } from 'vitest'
import { emptySyncDoc } from '../core'
import { HttpApi, KEEPALIVE_LIMIT_BYTES } from './api'

function recorder() {
  const calls: { path: string; keepalive: boolean | undefined; size: number }[] = []
  const fetchFn = (async (path: string, init: RequestInit) => {
    calls.push({ path, keepalive: init.keepalive, size: String(init.body ?? '').length })
    return new Response(JSON.stringify(emptySyncDoc()), { status: 200 })
  }) as unknown as typeof fetch
  return { calls, api: new HttpApi(fetchFn) }
}

describe('HttpApi.sync on page hide', () => {
  it('uses keepalive for a small document', async () => {
    const { api, calls } = recorder()
    await api.sync(emptySyncDoc(), { keepalive: true })
    expect(calls[0].keepalive).toBe(true)
  })

  it('still sends a document over the keepalive quota, as a normal request', async () => {
    const { api, calls } = recorder()
    const big = { ...emptySyncDoc(), unlockedAt: {}, legacySolves: Object.fromEntries(Array.from({ length: 6000 }, (_, i) => [`m${i}x`, 1])) }
    await api.sync(big, { keepalive: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].size).toBeGreaterThan(KEEPALIVE_LIMIT_BYTES)
    expect(calls[0].keepalive).toBe(false)
  })
})
