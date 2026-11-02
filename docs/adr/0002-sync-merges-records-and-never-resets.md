---
status: accepted
---

# Sync merges per-Game records, and Statistics can't be reset

A signed-in device syncs its progress with its Account by merging. No device's copy is treated as the master, so merging must give the same result in any order and must never lose a solve. Each piece of data is stored in a form that merges cleanly:

- **Statistics are counted from per-Game records, not stored as counters.** Each Game gets a permanent ID when it starts. Its record holds the difficulty, the start time and, for a win, the time. Played, won and best time are computed from the records. Records merge by ID, and a win recorded on either side counts. Counters can't be merged: two phones with 3 wins each should total 6, and a counter can't tell that apart from the same 3 wins seen twice.
- **The Daily log and Achievements only ever grow.** For each day the merge keeps the earliest first opening and every solve. For each Achievement it keeps the earliest unlock. Streaks, the Calendar and Perfect Week/Full Month are computed from the merged log.
- **Games in progress are last-writer-wins per slot**, using the time of the last move on the device that made it. Finishing or replacing a Game leaves a dated "cleared" marker, so a device that's behind can't bring back a finished Game.
- **Reset Statistics is removed.** With syncing, a reset on one device would be undone by the next merge from a device that hadn't seen it. An account-wide reset date would fix that, but we chose to drop the feature instead.

## Consequences

- Every Game ever started is kept as a small record. That's a few hundred records per person per year, so a few KB.
- An unfinished Game that loses a last-writer-wins conflict is dropped, but it still counts as played.
- Device clocks decide last-writer-wins. A device whose clock is far off can win a conflict it should lose. We accept that for a few players.

## Considered options

- **Per-device counters, summed across devices:** they merge correctly, but they can't support a best time per Game and would need their own reset rules.
- **The server's copy always wins:** simple, but progress made offline on a device would be lost.
- **An account-wide reset date that hides older Games:** keeps Reset Statistics working, at the cost of one more rule nobody asked for.
