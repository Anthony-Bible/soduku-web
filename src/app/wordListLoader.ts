import { CURRENT_WORD_LIST_VERSION, parseWordList, wordListPath, type WordList } from '../core/lettergrid'

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

const loads = new Map<number, Promise<WordList>>()

/**
 * Loads a Word List version, once per page. Called only when Lettergrid is opened, so Sudoku never
 * pays for it; the service worker caches the file for offline play. A failed load is not remembered,
 * so the next open retries.
 */
export function loadWordList(
  version: number = CURRENT_WORD_LIST_VERSION,
  fetcher: Fetcher = (url) => fetch(url),
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<WordList> {
  let pending = loads.get(version)
  if (!pending) {
    pending = (async () => {
      const response = await fetcher(`${baseUrl}${wordListPath(version)}`)
      if (!response.ok) throw new Error(`Word List v${version} failed to load (${response.status})`)
      const list = parseWordList(await response.text())
      if (list.version !== version) throw new Error(`Expected Word List v${version}, got v${list.version}`)
      return list
    })()
    loads.set(version, pending)
    pending.catch(() => loads.delete(version))
  }
  return pending
}

/** For tests. */
export function resetWordListCache(): void {
  loads.clear()
}
