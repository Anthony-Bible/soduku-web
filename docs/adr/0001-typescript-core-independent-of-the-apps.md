---
status: accepted
---

# The web app has its own TypeScript core, and its Daily Puzzles don't match the apps

The PWA reimplements the Sudoku rules in TypeScript and does not compile the Swift `SudokuCore` (from the original `soduko` repo) to WebAssembly. The iPhone and Android apps are going to be retired, so the PWA becomes the only client. Sharing the core across platforms (the reason for the apps' ADR 0002) stops mattering once there's only one platform.

Daily Puzzles are still generated on the device from their date (the same approach as the apps' ADR 0001), but with a TypeScript generator. **The web Daily Puzzle for a date is not the same puzzle the iPhone or Android app shows for that date.** We decided not to copy Swift's standard-library `shuffle` bit for bit.

## Rules

- Generation for a released generator version is frozen. A test pins the seed and the puzzle for one date. To change generation, add a new version and pick it by date so past days keep their puzzles.
- Saved Daily progress stores its own board and solution, so a game in progress is never affected by a generator change.

## Considered options

- **Swift core compiled to Wasm:** one rule set, and puzzles that match the apps. It costs a Swift toolchain in the web build and a multi-megabyte bundle, all to stay compatible with apps that are being removed.
- **TypeScript port that matches Swift bit for bit:** keeps puzzles the same as the apps, but ties the web generator to Swift standard-library internals forever.
