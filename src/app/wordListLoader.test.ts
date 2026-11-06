import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CURRENT_WORD_LIST_VERSION, wordListPath } from '../core/lettergrid'
import { loadWordList, resetWordListCache } from './wordListLoader'

const text = readFileSync(resolve(__dirname, '../../public', wordListPath(CURRENT_WORD_LIST_VERSION)), 'utf8')
const ok = async () => ({ ok: true, status: 200, text: async () => text })

beforeEach(resetWordListCache)

describe('loadWordList', () => {
  it('fetches the versioned artifact under the base URL and answers lookups', async () => {
    const urls: string[] = []
    const list = await loadWordList(
      CURRENT_WORD_LIST_VERSION,
      async (u) => (urls.push(u), ok()),
      '/app/',
    )
    expect(urls).toEqual([`/app/lettergrid/wordlist-v${CURRENT_WORD_LIST_VERSION}.txt`])
    expect(list.version).toBe(CURRENT_WORD_LIST_VERSION)
    expect(list.isWord('house')).toBe(true)
  })

  it('fetches once for concurrent and repeated opens', async () => {
    let calls = 0
    const f = async () => (calls++, ok())
    await Promise.all([loadWordList(1, f, '/'), loadWordList(1, f, '/')])
    await loadWordList(1, f, '/')
    expect(calls).toBe(1)
  })

  it('does not remember a failure', async () => {
    await expect(loadWordList(1, async () => ({ ok: false, status: 503, text: async () => '' }), '/')).rejects.toThrow()
    await expect(loadWordList(1, ok, '/')).resolves.toBeDefined()
  })

  it('rejects an artifact of the wrong version', async () => {
    await expect(loadWordList(2, ok, '/')).rejects.toThrow(/v2/)
  })
})
