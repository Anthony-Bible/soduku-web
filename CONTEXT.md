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

**Statistics**:
For each difficulty, the Games played and won and the best winning time, counted across every device of an Account; they are never reset.
_Avoid_: Stats, scores, records

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

### Accounts

**Account**:
A person's identity, keyed by their email address, under which their progress is kept and synced across devices.
_Avoid_: User, profile, login

**Invite List**:
The email addresses allowed to create an Account; any other address is never sent anything.
_Avoid_: Allowlist, whitelist, beta list

**Sign-in Email**:
The email sent to an address on the Invite List, carrying one Magic Link and one Sign-in Code that are valid for the same short window.
_Avoid_: Login email, verification email

**Magic Link**:
The link in a Sign-in Email that signs in whichever browser opens it.
_Avoid_: Login link, verification link, token

**Sign-in Code**:
The six-digit code in a Sign-in Email, typed into the app to sign in that device; it is how an installed app signs in.
_Avoid_: OTP, PIN, verification code

**Signed Out**:
Playing with no Account, where progress lives only on this device; every feature except sync still works.
_Avoid_: Guest, anonymous, offline mode

**Installed App**:
The app added to a device's home screen or dock and opened on its own rather than in a browser tab. On iPhone and iPad it keeps its progress apart from the browser's, so it starts **Signed Out** until the player signs in there.
_Avoid_: PWA, home-screen app, standalone

### Rewards

**Achievement**:
A named goal, kept with the Account or on the device when Signed Out, that unlocks once and stays unlocked, grouped as Streak, Milestone, Skill or Calendar.
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
- An **Account** can only be created for an email on the **Invite List**; the first **Sign-in Email** it uses creates it, so there is no separate sign-up
- A **Sign-in Email** is used once: using its **Magic Link** or its **Sign-in Code** spends both
- Signing in merges the device's progress into the **Account**: every solve, unlock and best time from every device is kept, and nothing is discarded
- A **Game** in progress follows its **Account** to every device; when two devices disagree, the one played most recently wins and the other's unfinished **Game** is dropped (it still counts as played)
- Signing out sends any unsynced progress to the **Account**, then clears the device back to **Signed Out** with no progress
- Any past day's **Daily Puzzle** can be opened for a **Catch-Up Solve**; future days cannot be opened

## Example dialogue

> **Dev:** "Friday's **Daily Puzzle** was opened at 11:58 PM Friday and solved at 12:03 AM Saturday. Is that a **Catch-Up Solve**?"
> **Domain expert:** "No, it was opened on Friday, so it's an **On-Day Solve** and the **Streak** survives. If it had been opened for the first time on Saturday from the **Calendar**, that would be a **Catch-Up Solve**."

## Flagged ambiguities

- "track daily" was used to mean a daily puzzle, a streak and a calendar — resolved: all three exist, and they are separate terms (**Daily Puzzle**, **Streak**, **Calendar**).
