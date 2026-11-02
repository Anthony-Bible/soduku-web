# Sudoku

A single-player Sudoku game that runs in the browser and installs as a PWA. It replaces the earlier iPhone and Android apps. This glossary pins down the words used for play, progress and rewards.

## Language

### Play

**Game**:
One attempt at solving one puzzle, from first view to win or abandonment.
_Avoid_: Round, session, match

**Mistake**:
A value entered into a cell that differs from the solution. Counted, never fatal.
_Avoid_: Strike, life, error

### Daily

**Daily Puzzle**:
The one puzzle assigned to a calendar day, identical every time it is opened; its difficulty is set by weekday (Mon–Tue Easy, Wed–Thu Medium, Fri–Sat Hard, Sun Expert).
_Avoid_: Puzzle of the day, daily challenge

**On-Day Solve**:
Solving a Daily Puzzle that was first opened on the calendar day it belongs to, however late the solve lands.
_Avoid_: On-time solve

**Catch-Up Solve**:
Solving a past day's Daily Puzzle that was first opened after that day ended.
_Avoid_: Late solve, backfill

**Streak**:
The number of consecutive calendar days, ending today or yesterday, that each have an On-Day Solve.
_Avoid_: Run, chain

**Longest Streak**:
The highest Streak ever reached; it never decreases.
_Avoid_: Best streak, record

**Calendar**:
The month view showing, for each day, whether its Daily Puzzle has an On-Day Solve, a Catch-Up Solve, or neither; past days can be opened from it.
_Avoid_: History, log

### Rewards

**Achievement**:
A named goal kept on the device that unlocks once and stays unlocked, grouped as Streak, Milestone, Skill or Calendar.
_Avoid_: Badge, trophy, award

**Perfect Week**:
A Monday-to-Sunday week in which every day has an On-Day Solve.

**Full Month**:
A calendar month in which every day's Daily Puzzle is solved, by On-Day or Catch-Up Solve.

## Relationships

- Each calendar day has exactly one **Daily Puzzle**
- A **Streak** counts only **On-Day Solves**; a **Catch-Up Solve** never extends or repairs one
- Ordinary **Games** never affect the **Streak** or the **Calendar**
- A **Daily Puzzle** solve is also a **Game** of its weekday's difficulty in the statistics
- The **Calendar** distinguishes **On-Day Solves** from **Catch-Up Solves**
- Skill and Milestone **Achievements** count any solved **Game**, ordinary or **Daily Puzzle**; Streak and Calendar **Achievements** count only **Daily Puzzles**
- Any past day's **Daily Puzzle** can be opened for a **Catch-Up Solve**; future days cannot be opened

## Example dialogue

> **Dev:** "Friday's **Daily Puzzle** was opened at 11:58 PM Friday and solved at 12:03 AM Saturday. Is that a **Catch-Up Solve**?"
> **Domain expert:** "No, it was opened on Friday, so it's an **On-Day Solve** and the **Streak** survives. If it had been opened for the first time on Saturday from the **Calendar**, that would be a **Catch-Up Solve**."

## Flagged ambiguities

- "track daily" was used to mean a daily puzzle, a streak and a calendar — resolved: all three exist, and they are separate terms (**Daily Puzzle**, **Streak**, **Calendar**).
