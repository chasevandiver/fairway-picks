# Fairway Picks — ideas backlog

Written up from the commissioner's notes. Nothing here is built yet — the only
code that shipped alongside this doc is the Majors Wall fix (note 2, done).

Each item carries an effort tag and a "needs" line so you can pick by appetite
rather than by reading the whole thing:

- **S** — an hour or two, one file, no new data.
- **M** — half a day, a few files, still no schema change.
- **L** — multi-day, new tables or a data pipeline.

---

## 1. Tournaments played & golfers picked · **S**

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

One wrinkle: the founding league's all-time row is `ALL_STATS` +
live results, and `ALL_STATS` has no pick counts for 2020–2025. Until note 3
lands, the honest options are to label the column "since 2026" or to leave it
blank for the pre-app era. Don't invent a number — `first + second + third`
looks like an event count but is really a podium count.

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

## 3. Historical seasons from the old sheets · **L**

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

One genuine roster gap to decide on: **JHall** played 2023–24 and owns the 2023
Masters in `MAJORS_HISTORY`, but isn't in `LEGACY_PLAYERS` — so that major
currently counts for nobody. Either add him as a historical-only name or accept
that his results stay unattributed.

### The double-counting trap

`StatsTab` computes the founding league's all-time row as
**`ALL_STATS` (hardcoded lifetime totals) + everything derived from `history`**
(`StatsTab.tsx:821-833`). Import 2020–2025 into `history` and every first,
podium, tour win and cut is counted twice.

So the import can't be additive. Staged fix:

1. **Import 2020–2025** into real `tournaments` / `results` / `golfer_results`
   rows, marked so they're distinguishable from app-era events.
2. **Switch the all-time table from "baseline + live" to "derived, with a
   baseline fallback"** — sum from imported rows for any season that's been
   imported, and fall back to `ALL_STATS` only for seasons that haven't. Never
   both for the same season.
3. **Season money falls out for free.** `tournaments.date` already carries the
   year, so a season selector needs no schema change — just a filter applied to
   `history` before it reaches Stats, Money and History.

### The checksum

The 2026 sheet's Lifetime Earnings block gives an independent reconciliation
target for the import: **Chase −$265 · Max −$70 · Hayden $225 · Andrew −$15 ·
Brennan $190**. If the imported per-tournament money doesn't sum to those
figures, the import is wrong — do not adjust the target to match.

### Practical notes

- The Drive MCP reader returns worksheet contents but **not worksheet titles**,
  and long sheets come back truncated. A reliable import wants the Sheets API
  (`spreadsheets.get?fields=sheets.properties.title`) or an xlsx export per
  season rather than MCP reads.
- 2025 is already an xlsx, so exporting the rest to xlsx makes all six seasons
  a single code path.
- Do this **one season at a time**, verifying money totals per season before
  moving on. Six seasons of silent drift is not debuggable.

---

## 4. More stats, with descriptions · **S–M each**

Every section already got a one-line `SectionDesc` explainer. Two gaps remain:
a **glossary** and more to explain.

### Glossary · **S**

One page defining every term in the order it appears, and — more useful — the
things that surprise people:

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

Richest untapped source is `golfer_results.rounds` — per-round strokes for
every drafted golfer, currently read only by `BestSingleRound`.

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

Everything marked "existing" is a pure function of `history` / `golferHistory`
and slots straight into `LeagueInsights` (`StatsTab.tsx:602-623`) next to the
ten components already there.

**Put the maths in `src/lib/`, not in the tab.** `vitest.config.ts` only
includes `src/**/*.test.ts`, so anything living in a `.tsx` can never be tested.
`StatsTab.tsx` is already 1,266 lines with thirteen inline components.

---

## 5. Tournament companion · **M**

Both of the picked features are pure client-side derivations of data the app
already polls every 120 s. No schema change, no new endpoint, no new
permissions. They belong on the Leaderboard tab beside the existing Projected
Payouts strip.

### Live head-to-head + sweat meter

- **Head-to-head:** your adjusted total against each opponent's, as a signed
  stroke margin — "you lead Max by 3, trail Hayden by 1". `computeStandings`
  already returns every player's `totalScore`; this is presentation.
- **Sweat meter:** which single golfer is swinging the most money right now.
  Re-run `computeMoney` with one golfer's score nudged, diff the payouts, and
  show the largest mover — "Scheffler is worth $30 to Chase". `computeMoney` is
  pure and cheap, so this is a memo over a handful of re-runs.

Both read straight from what `page.tsx:396-403` already memoizes.

### Cut-line tracker + holes left

- **Cut line:** `PicksTab.tsx:24-30` already estimates it as the 65th
  percentile of active golfers. Promote that to `src/lib/` (so it's testable),
  show the projected number, and mark each of your golfers' cushion — with a
  bubble warning inside a stroke either way.
- **Holes left:** sum `18 - thru` across each player's live golfers. Whoever has
  the most golf left has the most room to move — "you have 41 holes left,
  Andrew has 22". Genuinely changes how a Friday afternoon feels.

Only show either during live play: the cut line is meaningless after R2, and
holes-left is zero once everyone's in.

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
