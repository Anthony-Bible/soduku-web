import '@testing-library/jest-dom/vitest'

// jsdom has no canvas; Confetti draws on one.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
}
