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
    // For any golfer with all 4 rounds complete:
    //   par = (total_strokes - total_to_par) / 4
    // ESPN's c.score = total to-par for the tournament
    let PAR = DEFAULT_PAR
    for (const c of raw) {
      const rounds = parsedRoundsOnly[raw.indexOf(c)]
      const completedCount = rounds.filter((r: number | null) => r !== null).length
      if (completedCount === 4) {
        const totalStrokes = (rounds as number[]).reduce((a, b) => a + b, 0)
        const totalScore = parseFloat(c.score ?? 'x')
        if (!isNaN(totalScore)) {
          const impliedPar = Math.round((totalStrokes - totalScore) / 4)
          if (impliedPar >= 69 && impliedPar <= 74) {
            PAR = impliedPar
            break
          }
        }
      }
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
      if (roundCounts[ri] > 10) {
        currentRound = ri
        break
      }
    }
    const isWeekend = currentRound >= 2

    // ── Score values for position calculation ──
    const scoreValues: number[] = raw.map((c: any) => {
      const s = parseFloat(c.score ?? '999')
      return isNaN(s) ? 999 : s
    })

    const getStatusFromESPN = (c: any): 'active' | 'cut' | 'wd' => {
      const statusRaw = (c.status?.type?.name || '').toLowerCase()
      if (statusRaw.includes('cut')) return 'cut'
      if (statusRaw.includes('wd')) return 'wd'
      return 'active'
    }

    const getPosition = (idx: number, status: 'active' | 'cut' | 'wd'): string => {
      if (status === 'cut') return 'CUT'
      if (status === 'wd') return 'WD'
      const myScore = scoreValues[idx]
      const tiedCount = scoreValues.filter((s, i) => {
        const st = getStatusFromESPN(raw[i])
        return st === 'active' && s === myScore
      }).length
      const rank = scoreValues.filter((s, i) => {
        const st = getStatusFromESPN(raw[i])
        return st === 'active' && s < myScore
      }).length + 1
      return tiedCount > 1 ? `T${rank}` : `${rank}`
    }

    const competitors: GolferScore[] = raw.map((c: any, idx: number) => {
      const { rounds, today, thru: thruHole, activeRoundIdx } = parsedData[idx]

      // ── Status detection ──
      let status = getStatusFromESPN(c)

      // Secondary: weekend + only 2 rounds of data = cut
      if (status === 'active' && isWeekend) {
        const hasR3 = rounds[2] !== null || activeRoundIdx === 2
        const hasR4 = rounds[3] !== null || activeRoundIdx === 3
        if (!hasR3 && !hasR4) {
          status = 'cut'
        }
      }

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

      // For cut/wd: recalculate score from raw rounds using actual PAR
      if ((status === 'cut' || status === 'wd') && rounds[0] !== null && rounds[1] !== null) {
        score = rounds[0] + rounds[1] - PAR * 2
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
