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
    const parsedData = raw.map((c: any) => {
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      let todayScore: number | null = null
      let activeRoundIdx = -1

      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const rawStrokes = l.value
        const n = rawStrokes !== undefined && rawStrokes !== null ? Math.round(rawStrokes) : 0
        const isValidStrokes = n >= 55 && n <= 95

        if (isValidStrokes) {
          rounds[i] = n
        } else {
          // In-progress round — parse to-par from displayValue
          const displayVal = (l.displayValue || '').trim()
          let toParVal: number | null = null
          if (displayVal === 'E') toParVal = 0
          else {
            const parsed = parseInt(displayVal)
            if (!isNaN(parsed)) toParVal = parsed
          }
          if (toParVal !== null) {
            activeRoundIdx = i
            todayScore = toParVal
          }
        }
      })

      // If no in-progress round, today = last completed round's to-par
      if (activeRoundIdx === -1) {
        for (let i = 3; i >= 0; i--) {
          if (rounds[i] !== null) {
            todayScore = (rounds[i] as number) - PAR
            break
          }
        }
      }

      // ── Thru: check multiple ESPN locations ──
      let thruHole: string = '—'

      // 1. Try c.statistics first
      const stats: any[] = c.statistics || []
      const thruStat = stats.find((s: any) =>
        s.name === 'thru' ||
        s.abbreviation === 'THRU' ||
        s.name === 'holesPlayed' ||
        s.abbreviation === 'HOLES'
      )
      if (thruStat?.displayValue && thruStat.displayValue !== '--' && thruStat.displayValue !== '-') {
        thruHole = thruStat.displayValue
      }

      // 2. Try c.status for thru info
      if (thruHole === '—' && c.status) {
        const statusThru = c.status.thru ?? c.status.displayValue
        if (statusThru !== undefined && statusThru !== null && statusThru !== '--') {
          thruHole = String(statusThru)
        }
      }

      // 3. For active in-progress rounds, check linescore periodText/period
      // Only use if value > 4 (so we don't confuse round number with hole number)
      if (thruHole === '—' && activeRoundIdx >= 0) {
        const activeLine = lines[activeRoundIdx]
        if (activeLine) {
          const periodVal = activeLine.periodText ?? activeLine.period
          if (periodVal !== undefined) {
            const holeNum = parseInt(String(periodVal))
            if (!isNaN(holeNum) && holeNum > 4 && holeNum <= 18) {
              thruHole = String(holeNum)
            }
          }
        }
      }

      // 4. If no active round and last round is complete, thru = F
      if (thruHole === '—' && activeRoundIdx === -1) {
        for (let i = 3; i >= 0; i--) {
          if (rounds[i] !== null) { thruHole = 'F'; break }
        }
      }

      return { rounds, todayScore, thruHole, activeRoundIdx }
    })

    // ── Determine current tournament round ──
    // Use majority-based detection: find the highest round where >10 golfers
    // have data. This prevents a few early R4 finishers from pushing currentRound
    // to 3 while most of the field is still playing R3.
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

      // For cut/wd: recalculate score from raw rounds
      if ((status === 'cut' || status === 'wd') && rounds[0] !== null && rounds[1] !== null) {
        score = rounds[0] + rounds[1] - PAR * 2
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today: todayScore,
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
