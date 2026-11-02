import { isDifficulty } from './difficulty'
import type { GameState } from './gameState'

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
export const isNonNegInt = (v: unknown): v is number => isInt(v) && v >= 0

function isBoard(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === 81 &&
    v.every(
      (c) =>
        isObj(c) &&
        isInt(c.value) && c.value >= 0 && c.value <= 9 &&
        typeof c.given === 'boolean' &&
        isInt(c.notes) && c.notes >= 0 && c.notes < 512,
    )
  )
}

function isMove(m: unknown): boolean {
  if (!isObj(m) || !isInt(m.position) || m.position < 0 || m.position > 80 || !isObj(m.move)) return false
  const k = m.move
  switch (k.kind) {
    case 'setValue':
      return (
        isInt(k.previous) &&
        isInt(k.next) &&
        isInt(k.previousNotes) &&
        (k.clearedPeers === undefined ||
          (Array.isArray(k.clearedPeers) && k.clearedPeers.every((q) => isInt(q) && q >= 0 && q <= 80)))
      )
    case 'toggleNote':
      return isInt(k.number)
    case 'clearNotes':
      return isInt(k.previousNotes)
    default:
      return false
  }
}

/** A Game as it was saved before Games had ids (local storage v1). */
export function isLegacyGameState(v: unknown): v is Omit<GameState, 'id'> {
  return (
    isObj(v) &&
    isBoard(v.board) &&
    isBoard(v.solution) &&
    isDifficulty(v.difficulty) &&
    typeof v.seed === 'string' &&
    isNonNegInt(v.mistakes) &&
    isNonNegInt(v.hintsUsed) &&
    isNonNegInt(v.elapsedSeconds) &&
    (v.status === 'playing' || v.status === 'paused' || v.status === 'won') &&
    Array.isArray(v.history) &&
    v.history.every(isMove) &&
    (v.selected === null || (isInt(v.selected) && v.selected >= 0 && v.selected <= 80)) &&
    typeof v.isNotesMode === 'boolean' &&
    typeof v.startedAt === 'number'
  )
}

/** Ids are used as object keys, so they are restricted to a safe alphabet. */
const ID = /^[A-Za-z0-9_-]{1,64}$/
const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
export const isSafeId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !BANNED_KEYS.has(v)

export const isGameState = (v: unknown): v is GameState => isLegacyGameState(v) && isSafeId((v as unknown as Record<string, unknown>).id)
