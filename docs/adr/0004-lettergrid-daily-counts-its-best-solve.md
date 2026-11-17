---
status: accepted
supersedes: ADR 0003
---

# A Lettergrid Daily Puzzle can be replayed, and its best solve counts

ADR 0003 made a Lettergrid Daily Puzzle one attempt: only the earliest finished solve counted, so a second device couldn't act as a hidden retry. Players want to play the Daily again after solving it, so retrying is now an open feature. Any solved day, today or past, can be **replayed** from the start with the same Seed Word, Tile Run and Par, as many times as the player likes.

**The best-scoring solve counts** for the day's score, Par stars, Statistics and Share card. If two solves tie on score, the earliest finished wins, then the lower Game ID, so every device picks the same one in any merge order. Every solve is still kept in the Daily log, as ADR 0002 requires.

A Replay never changes the Calendar or the Streak. The day is already solved, and whether that solve is On-Day or Catch-Up depends only on when the day was first opened.

## Consequences

- Scores are no longer one-try scores. Par stars can be ground out, and a score that's already been shared can go up later. We accept that because replaying is the point.
- A solved day can have a Game in progress again, so a solved day's slot is no longer discarded just because the day is solved.

## Rules carried over from ADR 0003

- Each Lettergrid Daily Puzzle is judged forever against the Word List version and Par solver version it was published with, the same way ADR 0001 freezes the Sudoku generator. Adding or removing a word, or changing the solver, creates a new version picked by date. Past days keep their Par and their accepted words.
- Saved Lettergrid progress stores its own grid, Tile Run and Par, so a game in progress is never affected by a version change.

## Considered options

- **First solve counts, Replays are practice:** keeps scores comparable between players, but the player asked for replays to be able to improve the day's result.
- **Latest solve counts:** a bad replay would wipe out a good score.
