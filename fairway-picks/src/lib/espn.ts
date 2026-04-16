import type { GolferScore } from '@/lib/types'

const DEFAULT_PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: DEFAULT_PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: DEFAULT_PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: DEFAULT_PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: DEFAULT_PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: DEFAULT_PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: DEFAULT_PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [67, 70, 68, 71], par: DEFAULT_PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: DEFAULT_PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: DEFAULT_PAR },
]

export async function fetchLiveScores(): Promise<GolferScore[]> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error('ESPN fetch failed')
    const data = await res.json()

    const events = data?.events || []
    if (!events.length) return MOCK_DATA
    const competitions = events[0]?.competitions || []
    if (!competitions.length) return MOCK_DATA
    const raw = competitions[0]?.competitors || []
    if (raw.length < 5) return MOCK_DATA

    // Competition-level current round (1-indexed period from ESPN tournament status).
    // This is more reliable than counting completed rounds because ESPN sets it as soon
    // as a new round begins, before any golfer has finished a hole.
    const competitionPeriod = competitions[0]?.status?.period
    // Always subtract 1 to convert to 0-based, whether ESPN gives us a number or a string.
    const competitionPeriodNum = typeof competitionPeriod === 'number'
      ? competitionPeriod
      : parseInt(String(competitionPeriod ?? ''))
    const competitionRound = isNaN(competitionPeriodNum) ? -1 : competitionPeriodNum - 1

    // ── Step 1: Parse all round strokes first (without PAR dependency) ──
    // A completed 18-hole round: linescore.value >= 60 AND nested linescores.length === 18
    // An in-progress round: nested linescores.length < 18
    // We use the nested hole count as the definitive signal — not just the stroke value.
    const parsedRoundsOnly = raw.map((c: any) => {
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]

      lines.forEach((l: any) => {
        const roundIdx = (l.period ?? 0) - 1
        if (roundIdx < 0 || roundIdx > 3) return

        const holeLinescores: any[] = l.linescores || []
        const holesPlayed = holeLinescores.length

        // Only store as a completed round if ALL 18 holes are present
        if (holesPlayed === 18) {
          const n = Math.round(l.value ?? 0)
          if (n >= 60 && n <= 95) {
            rounds[roundIdx] = n
          }
        }
      })

      return rounds
    })

    // ── Step 2: Derive actual course PAR from completed rounds ──
    // For any golfer with N completed rounds and no in-progress round:
    //   par = (total_strokes - ESPN_total_to_par) / N
    // We skip golfers with an in-progress round because ESPN's c.score then includes
    // the partial round's contribution, which would corrupt the implied-par math.
    // Prefer golfers with more completed rounds (checked in descending order) for accuracy.
    let PAR = DEFAULT_PAR
    for (let targetCount = 4; targetCount >= 1; targetCount--) {
      for (const [idx, c] of raw.entries()) {
        const rounds = parsedRoundsOnly[idx]
        const completedRounds = (rounds as (number | null)[]).filter((r): r is number => r !== null)
        if (completedRounds.length !== targetCount) continue

        // Skip if any round is in-progress — c.score would include partial contributions
        const lines: any[] = c.linescores || []
        const hasInProgress = lines.some((l: any) => {
          const holeCount = (l.linescores || []).length
          return holeCount > 0 && holeCount < 18
        })
        if (hasInProgress) continue

        const totalStrokes = completedRounds.reduce((a, b) => a + b, 0)
        const totalScore = parseFloat(c.score ?? 'x')
        if (!isNaN(totalScore)) {
          const impliedPar = Math.round((totalStrokes - totalScore) / targetCount)
          if (impliedPar >= 69 && impliedPar <= 74) {
            PAR = impliedPar
            break
          }
        }
      }
      if (PAR !== DEFAULT_PAR) break
    }

    // ── Step 3: Full parse with correct PAR ──
    const parsedData = raw.map((c: any, rawIdx: number) => {
      const lines: any[] = c.linescores || []
      const rounds = parsedRoundsOnly[rawIdx]
      let today: number | null = null
      let thru: string = '—'
      let activeRoundIdx = -1

      lines.forEach((l: any) => {
        const roundIdx = (l.period ?? 0) - 1
        if (roundIdx < 0 || roundIdx > 3) return

        const holeLinescores: any[] = l.linescores || []
        const holesPlayed = holeLinescores.length

        if (holesPlayed === 18) {
          // Completed round — already in rounds[], skip
        } else if (holesPlayed > 0) {
          // In-progress round
          activeRoundIdx = roundIdx

          // Today = displayValue (to-par for this round so far)
          const displayVal = (l.displayValue || '').trim()
          if (displayVal === 'E') today = 0
          else {
            const parsed = parseInt(displayVal)
            if (!isNaN(parsed)) today = parsed
          }

          thru = String(holesPlayed)
        }
      })

      // No in-progress round = finished for the day
      if (activeRoundIdx === -1) {
        let lastDone = -1
        for (let i = 3; i >= 0; i--) {
          if (rounds[i] !== null) { lastDone = i; break }
        }
        if (lastDone >= 0) {
          thru = 'F'
          today = (rounds[lastDone] as number) - PAR
        }
      }

      return { rounds, today, thru, activeRoundIdx }
    })

    // ── Step 4: Determine current tournament round (majority-based) ──
    const roundCounts = [0, 1, 2, 3].map((ri) =>
      parsedData.filter((d: any) =>
        d.rounds[ri] !== null || d.activeRoundIdx === ri
      ).length
    )
    let currentRound = 0
    for (let ri = 3; ri >= 0; ri--) {
      if (roundCounts[ri] > 0) {
        currentRound = ri
        break
      }
    }
    // If ESPN's competition-level period is available and ahead of what round data shows
    // (e.g. R3 just started, no holes completed yet), trust the competition status.
    if (!isNaN(competitionRound) && competitionRound >= 0 && competitionRound > currentRound) {
      currentRound = competitionRound
    }
    const isWeekend = currentRound >= 2

    // ── Step 4.5: Fix today for golfers who haven't started the current round ──
    // If a golfer's last completed round is before the current tournament round,
    // they haven't played today yet — their "today" should be null, not their
    // previous round's score.
    parsedData.forEach((d: any) => {
      if (d.activeRoundIdx === -1) {
        let lastDone = -1
        for (let i = 3; i >= 0; i--) {
          if (d.rounds[i] !== null) { lastDone = i; break }
        }
        if (lastDone >= 0 && lastDone < currentRound) {
          d.today = null
          d.thru = '—'
        }
      }
    })

    // ── Score values for position calculation ──
    // ESPN returns "E" for even-par; parseFloat("E") === NaN so handle it explicitly.
    const scoreValues: number[] = raw.map((c: any) => {
      const raw = (c.score ?? '').toString().trim()
      if (raw === 'E') return 0
      const s = parseFloat(raw)
      return isNaN(s) ? 999 : s
    })

    // Determine cut/wd status purely from ESPN's own fields.
    // If ESPN says "CUT" in any of its position/status fields, the golfer is cut.
    // If ESPN gives them a real position (number, T5, etc.) they are NOT cut.
    // No secondary round-data inference — that kept over-marking everyone as cut.
    const getStatusFromESPN = (c: any, idx: number): 'active' | 'cut' | 'wd' => {
      // Check if score field is literally "CUT" or "WD"
      const scoreStr = (c.score ?? '').toString().trim().toUpperCase()
      if (scoreStr === 'CUT') return 'cut'
      if (scoreStr === 'WD' || scoreStr === 'WITHDRAWN') return 'wd'

      // Check status type name (e.g. "STATUS_CUT", "STATUS_WD", "STATUS_ACTIVE")
      const typeName = (c.status?.type?.name || '').toLowerCase()
      if (typeName.includes('cut')) return 'cut'
      if (typeName.includes('wd') || typeName.includes('withdraw')) return 'wd'

      // Check status type abbreviation (e.g. "CUT", "MC", "WD")
      const abbrev = (c.status?.type?.abbreviation || '').toUpperCase()
      if (abbrev === 'CUT' || abbrev === 'MC') return 'cut'
      if (abbrev === 'WD') return 'wd'

      // Check shortDetail / detail / description
      const shortDetail = (c.status?.type?.shortDetail || c.status?.type?.detail || c.status?.type?.description || '').toUpperCase()
      if (shortDetail === 'CUT' || shortDetail === 'MC' || shortDetail === 'MISSED CUT') return 'cut'
      if (shortDetail === 'WD' || shortDetail === 'WITHDRAWN') return 'wd'

      // Check status displayValue
      const displayValue = (c.status?.displayValue || '').toUpperCase()
      if (displayValue === 'CUT' || displayValue === 'MC' || displayValue === 'MISSED CUT') return 'cut'
      if (displayValue === 'WD' || displayValue === 'WITHDRAWN') return 'wd'

      // Check linescores displayValue
      const lines: any[] = c.linescores || []
      for (const l of lines) {
        const lDisplay = (l.displayValue || '').trim().toUpperCase()
        if (lDisplay === 'CUT' || lDisplay === 'MC') return 'cut'
        if (lDisplay === 'WD' || lDisplay === 'WITHDRAWN') return 'wd'
      }

      // Check ESPN's top-level active flag.
      // ESPN sets c.active = false for cut/WD competitors; players who made the cut
      // and are simply waiting to tee off in R3 remain c.active = true.
      // Guard: only apply during the weekend and only when the competitor completed
      // R1+R2 but has no R3 data (avoids mis-flagging players who finished R3 for the day,
      // whose rounds[2] would be non-null).
      if (c.active === false && currentRound >= 2) {
        const rounds = parsedRoundsOnly[idx]
        if (rounds[0] !== null && rounds[1] !== null && rounds[2] === null) {
          return 'cut'
        }
      }

      // Fallback: once R3 has started, a golfer who completed R1+R2 but has NO period-3
      // linescore entry at all is cut. Active players who haven't teed off yet still appear
      // in the ESPN feed with a placeholder {period:3,...} entry (tee time). Cut players
      // simply stop at period 2 — no period-3 entry exists for them.
      // Note: some tournaments/ESPN versions DO include a period-3 entry for cut players
      // (zero-hole placeholder); in that case this fallback won't fire but c.active above will.
      if (currentRound >= 2) {
        const rounds = parsedRoundsOnly[idx]
        const completedR1R2 = rounds[0] !== null && rounds[1] !== null
        const hasR3Entry = lines.some((l: any) => l.period >= 3)
        if (completedR1R2 && !hasR3Entry) return 'cut'
      }

      return 'active'
    }

    // Pre-compute all statuses so getPosition uses the correct values
    const statuses: ('active' | 'cut' | 'wd')[] = raw.map((c: any, idx: number) => getStatusFromESPN(c, idx))

    const getPosition = (idx: number, status: 'active' | 'cut' | 'wd'): string => {
      if (status === 'cut') return 'CUT'
      if (status === 'wd') return 'WD'
      const myScore = scoreValues[idx]
      const tiedCount = scoreValues.filter((s, i) => statuses[i] === 'active' && s === myScore).length
      const rank = scoreValues.filter((s, i) => statuses[i] === 'active' && s < myScore).length + 1
      return tiedCount > 1 ? `T${rank}` : `${rank}`
    }

    const competitors: GolferScore[] = raw.map((c: any, idx: number) => {
      const { rounds, today, thru: thruHole } = parsedData[idx]

      // ── Status detection (use pre-computed value) ──
      const status = statuses[idx]

      // ── Position ──
      const position = getPosition(idx, status)

      // ── Total score — use ESPN's value directly (already correct to-par) ──
      let score: number | null = null
      if (c.score !== undefined && c.score !== null) {
        const v = parseFloat(c.score)
        if (!isNaN(v)) score = v
      }

      // ── Thru ──
      const thru: string =
        status === 'cut' ? 'CUT' :
        status === 'wd'  ? 'WD'  :
        thruHole

      // For cut: recalculate score from R1+R2 using actual PAR
      if (status === 'cut' && rounds[0] !== null && rounds[1] !== null) {
        score = rounds[0] + rounds[1] - PAR * 2
      }

      // For WD: ESPN already has the correct score baked in from rounds played.
      // Only fall back to computing from rounds if ESPN didn't provide a numeric score.
      if (status === 'wd' && score === null) {
        const completedRounds = rounds.filter((r: number | null): r is number => r !== null)
        if (completedRounds.length > 0) {
          score = completedRounds.reduce((a: number, b: number) => a + b, 0) - PAR * completedRounds.length
        }
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today,
        thru,
        status,
        rounds,
        par: PAR,
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
