# Fairway Picks — ideas backlog

Written up from the commissioner's notes.

**Status: all five notes are built.** This doc is kept as the record of what was
decided and why — particularly the double-counting rules around imported
seasons, which are the reason several things work the way they do.

Effort tags below are what each item actually took:

- **S** — an hour or two, one file, no new data.
- **M** — half a day, a few files, still no schema change.
- **L** — multi-day, new tables or a data pipeline.

---

## 1. Tournaments played & golfers picked · **S** · shipped

**Needs:** nothing new — both numbers are already in memory.

The smallest item on the list. `SeasonScoreboard` already computes `played` and
then never renders it (`src/components/tabs/StatsTab.tsx:309-324`), and
`golferHistory` (one row per drafted golfer per event) gives both total picks
and distinct golfers per player.

Three tables want the columns:

| Table | File | Add |
|---|---|---|
| Season Scoreboard | `StatsTab.tsx` `SeasonScoreboard` | `Played` (already computed) |
| All-Time Player Stats (founding) | `StatsTab.tsx` ~`:874` | `Played`, `Golfers Picked` |
| Player Stats (custom leagues) | `StatsTab.tsx` `CustomLeagueStatsView` | `Golfers Picked` (`Played` exists) |

One wrinkle: the founding league's all-time row is `ALL_STATS` + live results,
and `ALL_STATS` has no pick counts for 2020–2025. Both columns are marked with
an asterisk and footnoted as app-era only rather than guessed at —
`first + second + third` looks like an event count but is really a podium
count. `appEraCounts()` also skips imported historical events, which carry
money but no roster.

`HistoryTab`'s Golfer Log already shows Total Picks / Unique Golfers / Tour
Wins / Cuts, but only for one player at a time behind a selector
(`HistoryTab.tsx:129-150`). The ask is the side-by-side view.

---

## 2. 2026 US Open winner — **fixed**

`PGA_SCHEDULE` stores the event as `'U.S. Open'`; the Majors Wall bucketed
majors with `name.includes('US Open')`, which is false on the periods. The
`?? 'The Open'` fallback then filed Chase's win under **The Open 2026**, so the
US Open cell rendered `—`.

Fixed by `src/lib/majors.ts` — one normalizer (`majorKey`) shared by the Majors
Wall and the admin's major auto-detect, returning `null` instead of defaulting.
Also fixed alongside it:

- The Open Championship (2026-07-16) and the U.S. Open both mapped to
  `'The Open'`, so once both finalized one silently overwrote the other.
- `liveStatsByPlayer[winner].majors++` was unguarded — a winner outside the six
  `LEGACY_PLAYERS` threw and blanked the entire Stats tab.
- Tied weeks kept only the last rank-1 row read. History now records
  `"A/B (Tie)"` and scores half a major each, matching how the hardcoded 2023
  Open tie has always been counted.

---

## 3. Historical seasons from the old sheets · **L** · shipped

**Needs:** an import pipeline and a rework of how all-time totals are summed.

### What's actually in Drive

| Season | File | Format |
|---|---|---|
| 2020 | "Golf Picks" (no year in the title) | Google Sheet |
| 2021 | Golf Picks 2021 | Google Sheet |
| 2022 | Golf Picks 2022 (+ a BACKUP and a Copy) | Google Sheet |
| 2023 | Golf Picks 2023 | Google Sheet |
| 2024 | Golf Picks 2024 | Google Sheet |
| 2025 | Golf Picks 2025.xlsx (+ 2 copies) | **xlsx, not a native Sheet** |
| 2026 | Golf Picks 2026 | Google Sheet — **not imported, see below** |

The layout is consistent across years, which is what makes this tractable:

- **Per-tournament tabs** carry a pool scoreboard (per-player R1–R4 totals and
  each golfer's finish) followed by one block per player listing **4 golfers
  with per-round strokes**. That is exactly the shape of `golfer_results`.
- **The season stats tab** holds a `16+ EVENTS` money ledger — one block per
  tournament flagging `Stroke Winner` / `Top 3 - No Win` / `Winning Golfer` and
  a signed dollar amount per player. That is exactly the shape of `results`.
- Majors are listed as `US Open` and **`British Open`** (never "The Open").
  `majorKey()` already handles both spellings.

### Two rules that keep the totals honest

**Import stops at 2025.** The 2026 season already lives in the app as real
`tournaments` / `results` / `golfer_results` rows. Importing the 2026 sheet
would create a second copy of every event. Use it as a cross-check, never as a
source.

**No new identities.** The roster stays the six in `src/lib/founding.ts`:
Eric, Max, Hayden, Andrew, Brennan, Chase. The `Terra` name appearing in the
2026 sheet tabs is not added.

**JHall is a historical-only name.** He played 2023–24 and owns the 2023 Masters
in `MAJORS_HISTORY`, but wasn't in any roster constant, so that major counted for
nobody. `HISTORICAL_PLAYER_NAMES` in `src/lib/founding.ts` now holds him:
counted by the all-time tallies and the Major Wins Leaderboard, accepted as a
column by the season importer, and given a row in the all-time table — but never
claimable, never in a draft order, and never in the active roster.

His finishes, cuts and tour winners were never recorded, so those cells show an
em dash rather than a zero that would read as "played and never placed". A test
now asserts every winner in `MAJORS_HISTORY` is attributable to someone, so this
can't silently regress when a name is added.

### The double-counting trap

`StatsTab` computes the founding league's all-time row as
**`ALL_STATS` (hardcoded lifetime totals) + everything derived from `history`**
(`StatsTab.tsx:821-833`). Import 2020–2025 into `history` and every first,
podium, tour win and cut is counted twice.

So the import can't be additive. What shipped:

1. **Migration 012 adds `tournaments.is_historical`.** An imported event is a
   real tournament in every other respect — it appears in History and in money
   totals — but `countsTowardTallies()` makes every all-time finish, cut and
   major tally skip it, because the baseline already counts those events.
2. **Money is added with no guard, because there is nothing to guard against.**
   `ALL_STATS` records finishes and cuts, never dollars. That asymmetry is the
   whole reason this works: the number you were missing is the one number that
   was never duplicated.
3. **Season money falls out for free.** `tournaments.date` already carries the
   year, so `seasonOf()` and `moneyBySeason()` needed no schema change. The
   Money tab now leads with a Money by Season table and an all-time row, and
   the tournament history below it has season filter chips.
4. **Import is a paste, not a pipeline.** The Admin tab takes the money ledger
   copied straight out of a sheet — `parseHistoricalPaste()` in
   `src/lib/importHistory.ts` reads the sheet's own formats (`$60`, `($15)`,
   `M/D/YYYY`), skips non-player columns, and previews per-player season totals
   so you can check them against the sheet before writing anything.

The parser warns rather than blocks when a row doesn't net to zero. A pool only
redistributes money, so a non-zero row almost always means a player column was
missed on the way over — but a league that once did something unusual shouldn't
be locked out of importing its own history.

**When every pre-app season is in**, the baseline can be retired: drop
`ALL_STATS` / `MAJORS_HISTORY`, stop setting `is_historical`, and the tallies
become fully derived. Nothing above blocks that.

### The checksum

The 2026 sheet's Lifetime Earnings block gives an independent reconciliation
target: **Chase −$265 · Max −$70 · Hayden $225 · Andrew −$15 · Brennan $190**.
The import preview shows per-player totals before writing anything — check them
against the sheet. If they don't line up, the import is wrong; don't adjust the
target to match.

### Practical notes

- **One season at a time**, checking the preview totals against the sheet before
  importing. Six seasons of silent drift is not debuggable.
- Imported tournaments are ordinary rows — if a season goes in wrong, delete it
  from the History tab and paste it again.
- Fully automating the import was considered and rejected. The sheets run
  500KB–1.7MB each, and the Drive reader returns no worksheet titles and
  truncates long tabs, so a scripted read would be guessing at which tab is
  which. Pasting a season takes seconds and shows you exactly what is about to
  be written.
- Per-tournament golfer detail (the round-by-round blocks) is **not** imported
  by the paste — it carries money only. Bringing those in would let the
  round-derived stats reach back before 2026, and is the natural next step.

---

## 4. More stats, with descriptions · **S–M each** · shipped

Every section already had a one-line `SectionDesc` explainer. Two gaps are now
closed: a **glossary** and more to explain.

### Glossary

A collapsible section at the foot of the Stats tab, twelve terms, defining what
appears where — and, more usefully, the things that surprise people:

- **Adjusted score** vs. raw score: a cut golfer's missed weekend counts as a
  repeat of R1+R2 (`cutAdjScore`, `src/lib/scoring.ts:116`).
- **Top 3** excludes the winner. A golfer who wins is a "winner", not a "top 3".
- **Podium** on the Season Scoreboard means *your* weekly finish ≤ 3, not your
  golfer's.
- The two head-to-head tables genuinely differ: the founding table compares raw
  scores (`StatsTab.tsx:1126`), the generic grid compares ranks (`:38`).
- **Avg Finish** counts only weeks you played.
- Money is **rules-snapshot** money — a mid-season rules edit never rewrites a
  finished week.

### New stats

All twelve are built, in `src/lib/leagueStats.ts` (pure and tested) and
rendered by `src/components/tabs/MoreStats.tsx`. The richest source turned out
to be `golfer_results.rounds` — per-round strokes for every drafted golfer,
previously read by exactly one component.

The round-derived three needed a course par, which `golfer_results` never
stores. `derivePars()` solves it per tournament from any golfer who completed
four rounds: `par = (strokes − score) / 4`, taking the most common answer and
ignoring cut golfers whose stored score carries the doubling penalty.

Draft-slot value and chalk-vs-sleeper needed `pick_order` for finished events,
which `/api/league-data` only returned for the active tournament. It now also
returns `historyPicks` — a narrow select over the finished tournament ids.

| Stat | What it says | Needs |
|---|---|---|
| **Weekend vs. weekday** | R3+R4 scoring vs. R1+R2 per player | `rounds` |
| **Sunday charge** | avg R4 relative to the player's own average | `rounds` |
| **Par-or-better rate** | share of drafted rounds at or under par | `rounds` + par |
| **Draft slot value** | avg finish by `pick_order` — is pick 1 actually worth it? | `picks` |
| **$ per golfer drafted** | season money ÷ golfers drafted | existing |
| **Nemesis golfer** | the golfer who's cost you the most (cuts × weeks) | existing |
| **Bounce-back** | record in the week after a losing week | existing |
| **Heartbreakers** | weeks lost by one stroke | existing |
| **Golfer ROI board** | which golfers made the *league* the most money | existing |
| **Podium rate / cash rate** | as percentages, not raw counts | existing |
| **Record book** | best & worst single week, biggest blowout, longest streak | existing |
| **Chalk vs. sleeper** | avg draft position of the golfers you take | `picks` |

One judgement call worth recording: **most valuable golfers** splits each
week's money evenly across the four golfers on that roster. Crediting a single
golfer with a whole week would flatter whoever happened to sit beside a winner,
and no golfer wins a week alone.

**The maths lives in `src/lib/`, not in the tab.** `vitest.config.ts` only
includes `src/**/*.test.ts`, so anything in a `.tsx` can never be tested —
and `StatsTab.tsx` was already 1,266 lines with thirteen inline components.

---

## 5. Tournament companion · **M** · shipped

Both are pure client-side derivations of data the app already polls every
120 s — no schema change, no new endpoint, no new permissions. They sit on the
Leaderboard tab beside the existing Projected Payouts strip, in
`src/lib/live.ts`.

### Live head-to-head + sweat meter

Shipped as one **Where You Stand** card.

- **Head-to-head** — your adjusted total against each opponent's as a signed
  stroke margin: "lead Max 3, trail Hayden 1".
- **Sweat meter** — re-runs `computeMoney` with one golfer's score nudged two
  either way, diffs the payouts, and names the golfer moving the most dollars
  across the league. The engine is pure, so this is arithmetic over a memo.

### Cut-line tracker + holes left

- **Cut Watch** — `projectCutLine()` moved out of `PicksTab` into
  `src/lib/live.ts`, so both tabs now agree on the number and it is tested.
  Shows the projected line plus every drafted golfer's cushion, sorted most
  precarious first, with a bubble flag inside a stroke either way.
- **Holes Left** — `18 − thru` summed across each player's live golfers, as a
  bar per player. Whoever has the most golf left has the most room to move; a
  two-shot lead over someone with 30 holes in hand is not really a lead.

All three render only during live play, and Cut Watch hides after R2 when the
line stops meaning anything.

---

## Appendix — the heavier companion options

Not picked, kept for reference.

**League chat / reactions · L.** Trash talk scoped to the active tournament.
Needs a new `tournament_messages` table, league-scoped RLS following the pattern
in `supabase/migrations/006_league_isolation.sql`, and a realtime subscription
alongside the two in `page.tsx:368-381`. The realtime and RLS scaffolding
already exists, so the cost is mostly moderation and abuse surface, not wiring.

**Push notifications · L.** Lead changes, your golfer making or missing the cut,
final results. The app is already a PWA with a manifest and icons, but there's
no service worker and nowhere to store subscriptions. Also needs a server-side
trigger — the current polling is entirely client-side, so nothing runs when the
app is closed, which is exactly when a notification matters.
