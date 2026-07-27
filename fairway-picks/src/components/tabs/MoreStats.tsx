'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/scoring'
import { SectionDesc } from '@/components/app/SectionDesc'
import {
  weekendSplit, sundayCharge, parOrBetterRate, draftSlotValue, chalkVsSleeper,
  moneyPerGolfer, nemesisGolfers, bounceBack, heartbreakers, golferValue,
  playerRates, recordBook,
  type HistoryEntry, type GolferResult, type HistoryPick,
} from '@/lib/leagueStats'

// ─── Shared presentation ──────────────────────────────────────────────────────

const MONO = 'DM Mono'

/** Signed to-par style number: negative is good, so it reads green. */
function Rel({ value, digits = 1 }: { value: number; digits?: number }) {
  const rounded = Number(value.toFixed(digits))
  const text = rounded > 0 ? `+${rounded}` : rounded === 0 ? 'E' : String(rounded)
  return (
    <span className={`score ${rounded < 0 ? 'under' : rounded > 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
      {text}
    </span>
  )
}

function Pct({ value }: { value: number }) {
  return <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{Math.round(value * 100)}%</span>
}

function Num({ children, color = 'var(--text-dim)' }: { children: React.ReactNode; color?: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 13, color, fontWeight: 700 }}>{children}</span>
}

function Section({ title, note, desc, minWidth = 520, children }: {
  title: string
  note?: string
  desc: string
  minWidth?: number
  children: React.ReactNode
}) {
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">{title}</div>
        {note && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>{note}</span>}
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>{desc}</SectionDesc>
      <div className="scroll-x">
        <table className="table" style={{ minWidth }}>{children}</table>
      </div>
    </div>
  )
}

// ─── Round-derived ────────────────────────────────────────────────────────────

function WeekendSplit({ golferHistory, roster }: { golferHistory: GolferResult[]; roster: string[] }) {
  const rows = weekendSplit(golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="🌤️ Weekend vs. Weekday"
      note="Completed cards only"
      desc="How your golfers score once the cut is made (R3+R4) against how they started (R1+R2), both against par. A negative swing means your picks get better as the pressure goes up. Golfers who missed the cut have no weekend to measure, so they sit this one out."
    >
      <thead><tr><th>Player</th><th>R1+R2</th><th>R3+R4</th><th>Swing</th><th>Events</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Rel value={r.weekday} /></td>
            <td><Rel value={r.weekend} /></td>
            <td><Rel value={r.delta} /></td>
            <td><Num>{r.events}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function SundayCharge({ golferHistory, roster }: { golferHistory: GolferResult[]; roster: string[] }) {
  const rows = sundayCharge(golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="🏁 Sunday Charge"
      desc="Final-round scoring against that player's own average round. Measured against yourself, so nobody is punished here for a bad draft — only for how their golfers finish the job."
    >
      <thead><tr><th>Player</th><th>Final Round</th><th>Their Average</th><th>Charge</th><th>Rounds</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Rel value={r.finalRound} /></td>
            <td><Rel value={r.baseline} /></td>
            <td><Rel value={r.delta} /></td>
            <td><Num>{r.rounds}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function ParOrBetter({ golferHistory, roster }: { golferHistory: GolferResult[]; roster: string[] }) {
  const rows = parOrBetterRate(golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="🎯 Par or Better"
      desc="How often your drafted golfers get round in par or under. A blunt measure of pick quality that doesn't care about leaderboards — just whether the golfers you took can play."
      minWidth={420}
    >
      <thead><tr><th>Player</th><th>Rate</th><th>Rounds</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Pct value={r.rate} /></td>
            <td><Num>{r.good} of {r.total}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

// ─── Pick-derived ─────────────────────────────────────────────────────────────

function DraftSlotValue({ golferHistory, historyPicks }: { golferHistory: GolferResult[]; historyPicks: HistoryPick[] }) {
  const rows = draftSlotValue(golferHistory, historyPicks)
  if (rows.length === 0) return null
  return (
    <Section
      title="📋 Draft Slot Value"
      note="Whole league"
      desc="What each pick in the draft has actually been worth, pooled across everyone. If the first pick isn't finishing better than the third, the snake order is doing less than it looks."
    >
      <thead><tr><th>Pick</th><th>Avg Finish</th><th>Cut Rate</th><th>Tour Wins</th><th>Times Taken</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.pickOrder} className="row">
            <td style={{ fontWeight: 600 }}>#{r.pickOrder}</td>
            <td><Num color="var(--text)">{r.avgFinish !== null ? r.avgFinish.toFixed(1) : '—'}</Num></td>
            <td><Pct value={r.cutRate} /></td>
            <td><Num color="var(--gold)">{r.wins || '—'}</Num></td>
            <td><Num>{r.picks}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function ChalkVsSleeper({ historyPicks, roster }: { historyPicks: HistoryPick[]; roster: string[] }) {
  const rows = chalkVsSleeper(historyPicks, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="♟️ Chalk or Sleeper"
      desc="The average slot each player's golfers came off the board at. A low number means you take the names everyone wants; a high one means you go hunting further down."
      minWidth={420}
    >
      <thead><tr><th>Player</th><th>Avg Slot</th><th>Picks</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Num color="var(--indigo)">{r.avgSlot.toFixed(2)}</Num></td>
            <td><Num>{r.picks}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

// ─── History-derived ──────────────────────────────────────────────────────────

function MoneyPerGolfer({ history, golferHistory, roster }: { history: HistoryEntry[]; golferHistory: GolferResult[]; roster: string[] }) {
  const rows = moneyPerGolfer(history, golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="💵 Money Per Golfer"
      desc="Season money divided by golfers drafted — what an average pick has been worth to you. Rewards being efficient rather than just playing more weeks."
      minWidth={460}
    >
      <thead><tr><th>Player</th><th>Per Golfer</th><th>Total</th><th>Golfers</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td>
              <span className={`score ${r.perGolfer > 0 ? 'under' : r.perGolfer < 0 ? 'over' : 'even'}`} style={{ fontSize: 13, fontWeight: 700 }}>
                {formatMoney(Math.round(r.perGolfer * 100) / 100)}
              </span>
            </td>
            <td>
              <span className={`score ${r.total > 0 ? 'under' : r.total < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>{formatMoney(r.total)}</span>
            </td>
            <td><Num>{r.golfers}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function Nemesis({ golferHistory, roster }: { golferHistory: GolferResult[]; roster: string[] }) {
  const rows = nemesisGolfers(golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="😤 Nemesis Golfer"
      desc="The golfer who has missed the most weekends on your roster. Everyone has one they keep going back to anyway."
      minWidth={460}
    >
      <thead><tr><th>Player</th><th>Nemesis</th><th>Cuts</th><th>Times Picked</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td>{r.golfer}</td>
            <td><Num color="var(--red)">{r.cuts}</Num></td>
            <td><Num>{r.picks}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function BounceBack({ history, roster }: { history: HistoryEntry[]; roster: string[] }) {
  const rows = bounceBack(history, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="🔁 Bounce-Back"
      desc="How often a player wins money the week straight after losing some. Short memory, or a long one — this is the stat that tells you which."
      minWidth={460}
    >
      <thead><tr><th>Player</th><th>Bounce Rate</th><th>Record</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Pct value={r.rate} /></td>
            <td><Num>{r.wins} of {r.chances}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function Heartbreakers({ history, roster }: { history: HistoryEntry[]; roster: string[] }) {
  const rows = heartbreakers(history, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="💔 Heartbreakers"
      desc="Weeks finished exactly one stroke off the winning score. Nothing separates these from a win except one putt somewhere on Sunday."
      minWidth={460}
    >
      <thead><tr><th>Player</th><th>One-Shot Losses</th><th>Most Recent</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Num color="var(--red)">{r.count}</Num></td>
            <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.worst?.tournament ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function GolferValueBoard({ history, golferHistory, roster }: { history: HistoryEntry[]; golferHistory: GolferResult[]; roster: string[] }) {
  const rows = golferValue(history, golferHistory, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="📈 Most Valuable Golfers"
      note="Top 10"
      desc="Which golfers have been worth the most across the league. A week's money is split evenly between the four golfers on that roster — nobody wins a week alone, and crediting one golfer for all of it would flatter whoever happened to sit next to a winner."
      minWidth={520}
    >
      <thead><tr><th>Golfer</th><th>Value</th><th>Per Week</th><th>Weeks</th><th>Drafted By</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.golfer} className="row">
            <td style={{ fontWeight: 600 }}>{r.golfer}</td>
            <td>
              <span className={`score ${r.money > 0 ? 'under' : r.money < 0 ? 'over' : 'even'}`} style={{ fontSize: 13, fontWeight: 700 }}>
                {formatMoney(Math.round(r.money))}
              </span>
            </td>
            <td>
              <span className={`score ${r.perWeek > 0 ? 'under' : r.perWeek < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                {formatMoney(Math.round(r.perWeek))}
              </span>
            </td>
            <td><Num>{r.weeks}</Num></td>
            <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.drafters.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function Rates({ history, roster }: { history: HistoryEntry[]; roster: string[] }) {
  const rows = playerRates(history, roster)
  if (rows.length === 0) return null
  return (
    <Section
      title="📊 Podium &amp; Cash Rates"
      desc="Top-3 finishes and money weeks as a share of events entered, not raw counts — so anyone who missed a stretch of the season isn't buried by it."
      minWidth={460}
    >
      <thead><tr><th>Player</th><th>Podium Rate</th><th>Cash Rate</th><th>Played</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.player} className="row">
            <td style={{ fontWeight: 600 }}>{r.player}</td>
            <td><Pct value={r.podiumRate} /></td>
            <td><Pct value={r.cashRate} /></td>
            <td><Num>{r.played}</Num></td>
          </tr>
        ))}
      </tbody>
    </Section>
  )
}

function RecordBook({ history, golferHistory, roster }: { history: HistoryEntry[]; golferHistory: GolferResult[]; roster: string[] }) {
  const records = recordBook(history, golferHistory, roster)
  if (records.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">📕 The Record Book</div>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        League extremes, each with the week it happened. These are the ones that get brought up years later.
      </SectionDesc>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '16px 20px 20px' }}>
        {records.map(r => (
          <div key={r.label} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              {r.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: 'var(--gold)', margin: '6px 0 2px' }}>
              {r.value}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{r.holder}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>{r.detail}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.8, marginTop: 8 }}>{r.how}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY: { term: string; body: string }[] = [
  {
    term: 'Adjusted score',
    body: 'What a golfer counts for once the cut penalty is applied. A golfer who misses the cut has their 36-hole score doubled, so a missed weekend hurts roughly as much as two more bad rounds. Every total, standing and payout on the site uses adjusted scores — the raw number only appears on the tour leaderboard.',
  },
  {
    term: 'Top 3',
    body: 'A golfer finishing 2nd or 3rd. It deliberately excludes the winner, who is counted separately as a Winner — no golfer is ever both.',
  },
  {
    term: 'Winner (🎯)',
    body: 'You had the golfer who won the tournament outright. Different from winning the week yourself.',
  },
  {
    term: 'Weeks Won',
    body: 'Tournaments where your four golfers had the lowest combined adjusted score. This is the week you get paid for; a tie splits the pot.',
  },
  {
    term: 'Podium',
    body: 'On the Season Scoreboard this means your own weekly finish was 1st, 2nd or 3rd among the players. It is not about where your golfers finished on the tour leaderboard.',
  },
  {
    term: 'Avg Finish',
    body: 'Your average weekly placing, counting only the weeks you actually entered. Sitting a week out never helps or hurts it.',
  },
  {
    term: 'Head-to-Head',
    body: 'There are two versions and they genuinely differ. The all-time founding table compares raw combined scores week by week; the newer grid compares finishing rank. Same idea, different tiebreaks — a week where you scored better but placed the same shows up in one and not the other.',
  },
  {
    term: 'Majors',
    body: 'The Masters, PGA Championship, U.S. Open and The Open. Payouts on major weeks are multiplied by the league\'s majors multiplier. A tied major counts half a major for each winner.',
  },
  {
    term: 'Money',
    body: 'Derived from finalized results and nothing else. Each tournament freezes the rules that were in force when it was activated, so editing league rules mid-season never rewrites a week that has already finished.',
  },
  {
    term: 'Projected payouts',
    body: 'The same money engine run against live scores instead of final ones. It is a snapshot of where things stand, not a prediction, and it moves every time the feed updates.',
  },
  {
    term: 'Cut / WD',
    body: 'Cut means the golfer missed the 36-hole cut. WD means they withdrew. Both take the cut penalty, but a WD phases in with the field rather than locking immediately.',
  },
  {
    term: 'Played / Picked',
    body: 'Events you entered, and golfers you drafted across them. These count only the seasons the app itself holds — the pre-2026 records track finishes and cuts but never stored either number.',
  },
]

export function StatGlossary() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card mb-24">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '16px 20px', background: 'transparent', border: 0,
          color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit',
        }}
      >
        <span className="card-title">📖 Stat Glossary</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>
          {open ? 'Hide' : `${GLOSSARY.length} terms`}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px 20px' }}>
          {GLOSSARY.map(g => (
            <div key={g.term}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{g.term}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>{g.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── The block ────────────────────────────────────────────────────────────────

export function MoreStats({ history, golferHistory, historyPicks, roster }: {
  history: HistoryEntry[]
  golferHistory: GolferResult[]
  historyPicks: HistoryPick[]
  roster: string[]
}) {
  if (history.length === 0 || roster.length === 0) return null
  return (
    <>
      <Rates history={history} roster={roster} />
      <MoneyPerGolfer history={history} golferHistory={golferHistory} roster={roster} />
      <WeekendSplit golferHistory={golferHistory} roster={roster} />
      <SundayCharge golferHistory={golferHistory} roster={roster} />
      <ParOrBetter golferHistory={golferHistory} roster={roster} />
      <DraftSlotValue golferHistory={golferHistory} historyPicks={historyPicks} />
      <ChalkVsSleeper historyPicks={historyPicks} roster={roster} />
      <Nemesis golferHistory={golferHistory} roster={roster} />
      <BounceBack history={history} roster={roster} />
      <Heartbreakers history={history} roster={roster} />
      <GolferValueBoard history={history} golferHistory={golferHistory} roster={roster} />
      <RecordBook history={history} golferHistory={golferHistory} roster={roster} />
      <StatGlossary />
    </>
  )
}
