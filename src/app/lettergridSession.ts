import type { CalendarDay, LettergridSaved, PlayerProfile } from '../core'
import {
  applyAction,
  isFinished,
  resultOf,
  scoreOf,
  type Action,
  type ActionResult,
  type LettergridResult,
  type LettergridState,
  type PlacedTile,
  type WordList,
} from '../core/lettergrid'

export type { LettergridResult }

/**
 * One Lettergrid Daily being played. Every accepted Play is saved at once through the profile, so a finished
 * Daily is recorded as a solve the moment its last Play lands. A rejected Play changes nothing.
 */
export class LettergridSession {
  private saved: LettergridSaved

  constructor(
    readonly day: CalendarDay,
    saved: LettergridSaved,
    private readonly words: WordList,
    private readonly profile: PlayerProfile,
    private readonly onChange: () => void,
  ) {
    this.saved = saved
  }

  get gameId(): string {
    return this.saved.id
  }
  get state(): LettergridState {
    return this.saved.state
  }
  get score(): number {
    return scoreOf(this.saved.state)
  }
  get finished(): boolean {
    return isFinished(this.saved.state)
  }
  get result(): LettergridResult | null {
    return this.finished ? resultOf(this.saved.state) : null
  }

  private apply(action: Action): ActionResult {
    const result = applyAction(this.saved.state, action, this.words)
    if (!result.ok) return result
    this.saved = { ...this.saved, state: result.state }
    this.profile.saveLettergrid(this.day, this.saved)
    this.onChange()
    return result
  }

  /** Places tiles from the Rack as one Play. A rejection says why and leaves the Game untouched. */
  submit(tiles: readonly PlacedTile[]): ActionResult {
    return this.apply({ type: 'play', tiles })
  }

  /** Spends a Play to send the whole Rack to the back of the Tile Run. */
  swap(): ActionResult {
    return this.apply({ type: 'swap' })
  }
}
