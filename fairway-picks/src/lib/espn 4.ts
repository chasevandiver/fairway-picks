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

    // ── First pass: parse linescores for each golfer ──
    // For each linescore entry:
    //   - A COMPLETED round: l.value = raw strokes (e.g. 68.0), l.displayValue = to-par string (e.g. "-4"), periodText = "F"
    //   - An IN-PROGRESS round: l.value may be 0 or absent, l.displayValue = current to-par (e.g. "-2"), periodText = hole number (e.g. "14")
    //   - A NOT-STARTED round: entry may not exist, or l.value = 0 and l.displayValue = "E" or "-"
    const parsedData = raw.map((c: any) => {
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      let todayScore: number | null = null
      let thruHole: string = '—'
      let activeRoundIdx = -1

      lines.forEach((l: any, i: number) => {
        if (i >= 4) return

        const periodText = (l.period?.toString() || l.periodText?.toString() || '').trim()
        const displayVal = (l.displayValue || '').trim()
        const rawStrokes = l.value

        // Detect if this round is complete: value is valid strokes
        const n = rawStrokes !== undefined && rawStrokes !== null ? Math.round(rawStrokes) : 0
        const isValidStrokes = n >= 55 && n <= 95

        if (isValidStrokes) {
          // Completed round
          rounds[i] = n
        } else {
          // In-progress or not-started round
          // Check if there's a meaningful to-par displayValue (not blank, not "E" as placeholder, not "-")
          // and a hole number indicating play has started
          const holeNum = parseInt(periodText)
          const hasHole = !isNaN(holeNum) && holeNum > 0

          // Parse to-par from displayValue: "E" = 0, "-4" = -4, "+2" = 2
          let toParVal: number | null = null
          if (displayVal === 'E') {
            toParVal = 0
          } else {
            const parsed = parseInt(displayVal)
            if (!isNaN(parsed)) toParVal = parsed
          }

          // If we have a hole number, this round is actively in progress
          if (hasHole && toParVal !== null) {
            activeRoundIdx = i
            todayScore = toParVal
            thruHole = periodText  // hole number as string e.g. "14"
          } else if (isValidStrokes === false && rounds[i] === null) {
            // Check if it's a finished round reported via displayValue
            // Some ESPN responses use displayValue for finished rounds too
            // periodText = "F" means finished
            if (periodText === 'F' && toParVal !== null) {
              // Reconstruct strokes from to-par
              rounds[i] = PAR + toParVal
            }
          }
        }

        // If period is "F" and we have valid strokes, mark thru as F for this round
        if (periodText === 'F' && isValidStrokes) {
          // completed round, thru gets updated below based on last completed
        }
      })

      // Determine thru for completed golfers:
      // If no active round was found, check if last round is finished
      if (activeRoundIdx === -1) {
        // Find the last round with data
        let lastDone = -1
        for (let i = 3; i >= 0; i--) {
          if (rounds[i] !== null) { lastDone = i; break }
        }
        if (lastDone >= 0) {
          // Check the linescore periodText for that round
          const l = lines[lastDone]
          const periodText = (l?.period?.toString() || l?.periodText?.toString() || '').trim()
          if (periodText === 'F') {
            thruHole = 'F'
            // today = that round's to-par
            todayScore = (rounds[lastDone] as number) - PAR
          } else {
            // Round data exists but no "F" — still in progress but ESPN didn't give us hole
            // Fall back to deriving from the displayValue
            const displayVal = (lines[lastDone]?.displayValue || '').trim()
            if (displayVal === 'E') todayScore = 0
            else {
              const parsed = parseInt(displayVal)
              if (!isNaN(parsed)) todayScore = parsed
            }
            // thruHole stays '—' since we don't know the hole
          }
        }
      }

      return { rounds, todayScore, thruHole, activeRoundIdx }
    })

    // ── Determine current tournament round ──
    const roundsInPlay = [0, 1, 2, 3].filter((ri) =>
      parsedData.some((d: any) => d.rounds[ri] !== null)
    )
    // Also count rounds where active play is happening
    parsedData.forEach((d: any) => {
      if (d.activeRoundIdx >= 0 && !roundsInPlay.includes(d.activeRoundIdx)) {
        roundsInPlay.push(d.activeRoundIdx)
      }
    })
    const currentRound = roundsInPlay.length > 0 ? Math.max(...roundsInPlay) : 0
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
      const { rounds, todayScore, thruHole, activeRoundIdx } = parsedData[idx]

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

      // ── Today ──
      // Use what we parsed from linescores — this covers both in-progress and finished rounds
      const today = todayScore

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
