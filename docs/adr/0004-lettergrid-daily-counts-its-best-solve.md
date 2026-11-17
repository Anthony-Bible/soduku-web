---
status: accepted
supersedes: ADR 0003
---

# A Lettergrid Daily Puzzle can be replayed, and its best solve counts

ADR 0003 made a Lettergrid Daily Puzzle one attempt: only the earliest finished solve counted, so a second device couldn't act as a hidden retry. Players want to play the Daily again after solving it, so retrying is now an open feature. Any solved day, today or past, can be **replayed** from the start with the same Seed Word, Tile Run and Par, as many times as the player likes.

**The best-scoring solve counts** for the day's score, Par stars, Statistics and Share card. If two solves tie on score, the earliest finished wins, then the lower Game ID, so every device picks the same one in any merge order.

**Only each day's best solve is kept**, with its Final Board, the finished grid it was solved with. This is an exception to ADR 0002's "keep every solve": Replays are unlimited and each solve carries a board, so keeping them all would grow the synced document without bound, and every Account's document is a single row. Keeping the best of a day is still a clean merge. The order above is total, so taking the maximum gives the same result in any merge order and never loses a solved day or lowers its score. A document saved with several solves for a day is reduced to its best when it loads.

A Replay never changes the Calendar or the Streak. The day is already solved, and whether that solve is On-Day or Catch-Up depends only on when the day was first opened.

## Consequences

- Scores are no longer one-try scores. Par stars can be ground out, and a score that's already been shared can go up later. We accept that because replaying is the point.
- A solved day can have a Game in progress again, so a solved day's slot is no longer discarded just because the day is solved.
- A lower Replay leaves no record once it finishes. Its slot's dated "cleared" marker is what keeps a device that's behind from offering it as Continue again; solves no longer do that job for it. The finish screen reads the day's best score when the Replay opens, so it can still say "New best!".
- The synced document holds at most one Lettergrid solve and board per day, a few hundred bytes, however much a player replays.
- Solves recorded before Final Boards existed have no board, and their day shows none until a Replay beats them.

## Rules carried over from ADR 0003

- Each Lettergrid Daily Puzzle is judged forever against the Word List version and Par solver version it was published with, the same way ADR 0001 freezes the Sudoku generator. Adding or removing a word, or changing the solver, creates a new version picked by date. Past days keep their Par and their accepted words.
- Saved Lettergrid progress stores its own grid, Tile Run and Par, so a game in progress is never affected by a version change.

## Considered options

- **First solve counts, Replays are practice:** keeps scores comparable between players, but the player asked for replays to be able to improve the day's result.
- **Latest solve counts:** a bad replay would wipe out a good score.
- **Keep every solve, as ADR 0002 does:** keeps a full history nobody is shown, at the cost of unbounded growth. Keeping a board only on the best solve slows that growth but doesn't stop it, and capping Replays per day would limit the feature itself.
