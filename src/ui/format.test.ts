import { expect, test } from 'vitest'
import { accessibleElapsed, formatElapsed } from './format'

test('formatElapsed uses m:ss and h:mm:ss', () => {
  expect(formatElapsed(0)).toBe('0:00')
  expect(formatElapsed(65)).toBe('1:05')
  expect(formatElapsed(3600)).toBe('1:00:00')
  expect(formatElapsed(-5)).toBe('0:00')
})

test('accessibleElapsed spells units out', () => {
  expect(accessibleElapsed(192)).toBe('3 minutes 12 seconds')
  expect(accessibleElapsed(3601)).toBe('1 hour 1 second')
  expect(accessibleElapsed(0)).toBe('0 seconds')
})
