import type { GolferScore } from '@/lib/types'

const PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [69, 70, 68, 71], par: PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: PAR },
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

    // ── ESPN API structure (confirmed from live data) ──
    // c.linescores = array of rounds, one entry per round played
    //   linescore.period     = round number (1, 2, 3, 4)
    //   linescore.value      = raw strokes for COMPLETED rounds (55-95)
    //                          OR partial strokes for in-progress (e.g. 18 for 5 holes)
    //   linescore.displayValue = to-par for that round (e.g. "-4", "E", "+1")
    //   linescore.linescores = array of hole-by-hole scores
    //                          length = number of holes completed in that round
    //
    // c.statistics = [] (always empty at top level — ignore it)
    //
    // So: thru = linescore.linescores.length for the current round
    //     today = linescore.displayValue for the current round
    //     completed round = linescore.value >= 55 && <= 95

    const parsedData = raw.map((c: any) => {
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      let today: number | null = null
      let thru: string = '—'
      let activeRoundIdx = -1

      lines.forEach((l: any) => {
        // period is the round number (1-indexed), convert to 0-indexed
        const roundIdx = (l.period ?? 0) - 1
        if (roundIdx < 0 || roundIdx > 3) return

        const strokes = l.value
        const n = strokes !== undefined && strokes !== null ? Math.round(strokes) : 0
        const isCompletedRound = n >= 55 && n <= 95

        if (isCompletedRound) {
          rounds[roundIdx] = n
        } else {
          // In-progress round
          activeRoundIdx = roundIdx

          // Today's score = displayValue of this round entry (e.g. "-2", "E", "+1")
          const displayVal = (l.displayValue || '').trim()
          if (displayVal === 'E') today = 0
          else {
            const parsed = parseInt(displayVal)
            if (!isNaN(parsed)) today = parsed
          }

          // Thru = number of holes in the nested linescores array
          const holeLinescores: any[] = l.linescores || []
          const holesPlayed = holeLinescores.length
          if (holesPlayed > 0) {
            thru = holesPlayed === 18 ? 'F' : String(holesPlayed)
          }
        }
      })

      // If no in-progress round found, golfer has finished their round for the day
      if (activeRoundIdx === -1) {
        // Find the last completed round
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

    // ── Determine current tournament round ──
    // Majority-based: highest round where >10 golfers have data
    // Prevents a few early finishers from pushing currentRound ahead of the field
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

      // ── Total score to par ──
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

      // For cut/wd: recalculate score from raw rounds
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
