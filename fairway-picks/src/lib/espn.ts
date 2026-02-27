import type { GolferScore } from '@/lib/types'

const DEFAULT_PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: DEFAULT_PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: DEFAULT_PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: DEFAULT_PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: DEFAULT_PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: DEFAULT_PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: DEFAULT_PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [69, 70, 68, 71], par: DEFAULT_PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: DEFAULT_PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: DEFAULT_PAR },
]

// Parse ESPN to-par display strings: "-7" -> -7, "E" -> 0, "+2" -> 2, null/"--"/"-" -> null
function parseToPar(dv: string | undefined | null): number | null {
  if (!dv || dv === '--' || dv === '' || dv === '-') return null
  if (dv === 'E') return 0
  const n = parseInt(dv)
  return isNaN(n) ? null : n
}

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

    // Derive course par from first golfer's first completed round
    let coursePar = DEFAULT_PAR
    for (const c of raw) {
      const l0 = (c.linescores || [])[0]
      if (!l0) continue
      const strokes = Math.round(l0.value || 0)
      const toPar = parseToPar(l0.displayValue)
      if (toPar !== null && strokes >= 60 && strokes <= 80) {
        const derived = strokes - toPar
        if (derived >= 68 && derived <= 74) { coursePar = derived; break }
      }
    }

    // First pass: compute positions accounting for ties
    const scoreValues: number[] = raw.map((c: any) => {
      const s = parseFloat(c.score ?? '999')
      return isNaN(s) ? 999 : s
    })

    const getPosition = (idx: number, statusStr: string): string => {
      if (statusStr.includes('cut')) return 'CUT'
      if (statusStr.includes('wd')) return 'WD'
      const myScore = scoreValues[idx]
      const tiedCount = scoreValues.filter((s, i) => {
        const st = (raw[i].status?.type?.name || '').toLowerCase()
        return !st.includes('cut') && !st.includes('wd') && s === myScore
      }).length
      const rank = scoreValues.filter((s, i) => {
        const st = (raw[i].status?.type?.name || '').toLowerCase()
        return !st.includes('cut') && !st.includes('wd') && s < myScore
      }).length + 1
      return tiedCount > 1 ? `T${rank}` : `${rank}`
    }

    const competitors: GolferScore[] = raw.map((c: any, idx: number) => {
      const statusRaw = (c.status?.type?.name || '').toLowerCase()
      const status: 'active' | 'cut' | 'wd' =
        statusRaw.includes('cut') ? 'cut' :
        statusRaw.includes('wd')  ? 'wd'  : 'active'

      const position = getPosition(idx, statusRaw)

      let score: number | null = parseToPar(c.score)

      // Round-by-round raw strokes: l.value = raw strokes, valid 55-95
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const n = Math.round(l.value || 0)
        if (n >= 55 && n <= 95) rounds[i] = n
      })

      // Find last round actually played (has nested hole linescores)
      let activeRoundIdx = -1
      for (let i = lines.length - 1; i >= 0; i--) {
        if ((lines[i].linescores?.length ?? 0) > 0) {
          activeRoundIdx = i
          break
        }
      }

      // Between rounds: active round finished (18 holes) AND next round slot
      // exists but hasn't started yet (holes=0, dv="-")
      const activeRoundFinished = activeRoundIdx >= 0 &&
        (lines[activeRoundIdx].linescores?.length ?? 0) >= 18
      const nextRoundNotStarted = activeRoundIdx >= 0 &&
        activeRoundIdx < lines.length - 1 &&
        (lines[activeRoundIdx + 1]?.linescores?.length ?? 0) === 0
      const betweenRounds = activeRoundFinished && nextRoundNotStarted

      // Today: null if between rounds, otherwise active round to-par
      let today: number | null = null
      if (!betweenRounds && activeRoundIdx >= 0) {
        today = parseToPar(lines[activeRoundIdx]?.displayValue)
      }

      // Thru
      let thru: string = '—'
      if (status === 'cut') {
        thru = 'CUT'
      } else if (status === 'wd') {
        thru = 'WD'
      } else if (betweenRounds) {
        thru = '—'
      } else if (activeRoundIdx >= 0) {
        const activeHoles: any[] = lines[activeRoundIdx]?.linescores || []
        thru = activeHoles.length >= 18 ? 'F' : String(activeHoles.length)
      }

      // Cut/WD score: sum to-par across all played rounds
      if (status === 'cut' || status === 'wd') {
        let toParSum = 0
        let validRounds = 0
        for (const l of lines) {
          const v = parseToPar(l?.displayValue)
          if (v !== null) { toParSum += v; validRounds++ }
        }
        if (validRounds > 0) score = toParSum
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today,
        thru,
        status,
        rounds,
        par: coursePar,
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
