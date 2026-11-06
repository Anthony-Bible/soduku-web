---
status: accepted
---

# A Lettergrid Daily Puzzle counts its first finished solve, against a frozen Word List

A Lettergrid Daily Puzzle has a score, so unlike Sudoku it matters which solve counts. Two devices can each solve the same day before they sync, for example a phone offline on a train and a laptop at home. **Only the earliest finished solve counts** for the day's score, Par, Calendar and Statistics. If two solves finish at the same moment, the lower Game ID wins, so every device picks the same one in any merge order. Every solve is still kept in the Daily log, as ADR 0002 requires. The later ones just don't count.

A Daily is one attempt. If the best score counted, a second device kept offline would be a hidden retry, and Par stars could be ground out. Scores are only comparable between players if everyone gets the same Tile Run and one try at it.

## Rules

- Each Lettergrid Daily Puzzle is judged forever against the Word List version and Par solver version it was published with, the same way ADR 0001 freezes the Sudoku generator. Adding or removing a word, or changing the solver, creates a new version picked by date. Past days keep their Par and their accepted words.
- Saved Lettergrid progress stores its own grid, Tile Run and Par, so a game in progress is never affected by a version change.

## Considered options

- **The best solve counts:** friendlier, but it turns a second device into a retry button, and a score that's already been shared could later change.
- **Show every solve:** honest, but the Calendar and Share card still have to choose one.
