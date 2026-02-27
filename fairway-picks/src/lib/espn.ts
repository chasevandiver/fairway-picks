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

    // ── Get actual course par ──
    const courseDetails = competitions[0]?.details || []
    let coursePar = DEFAULT_PAR
    for (const detail of courseDetails) {
      if (detail.type?.id === 'par' && detail.value) {
        const p = parseInt(detail.value)
        if (!isNaN(p) && p >= 68 && p <= 73) {
          coursePar = p
          break
        }
      }
    }
    console.log(`🏌️ Course Par: ${coursePar}`)

    // First pass: figure out positions accounting for ties
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
      // ── Status ──
      const statusRaw = (c.status?.type?.name || '').toLowerCase()
      const status: 'active' | 'cut' | 'wd' =
        statusRaw.includes('cut') ? 'cut' :
        statusRaw.includes('wd')  ? 'wd'  : 'active'

      // ── Position ──
      const position = getPosition(idx, statusRaw)

      // ── Total score to par ── ESPN returns this as a string in c.score e.g. "-16"
      let score: number | null = null
      if (c.score !== undefined && c.score !== null) {
        const v = parseFloat(c.score)
        if (!isNaN(v)) score = v
      }

      // ── Round-by-round linescores ──
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]

      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const strokes = l.value  // raw strokes as a float e.g. 63.0
        if (strokes !== undefined && strokes !== null) {
          const n = Math.round(strokes)
          if (n >= 55 && n <= 95) {
            rounds[i] = n
          }
        }
      })

      // ── Thru ──
      const stats: any[] = c.statistics || []
      const thruStat = stats.find((s: any) => s.name === 'thru' || s.abbreviation === 'THRU')
      const thruVal = thruStat?.displayValue
      const thru: string =
        status === 'cut' ? 'CUT' :
        status === 'wd'  ? 'WD'  :
        thruVal && thruVal !== '--' ? thruVal : '—'

      // ── Today (current round to par) ──
      // Use ESPN's score directly if it exists, otherwise derive from last played round
      let today: number | null = null
      
      // First, try to get it from ESPN's data
      const todayStat = stats.find((s: any) => s.name === 'today' || s.abbreviation === 'TODAY')
      if (todayStat?.displayValue && todayStat.displayValue !== '--') {
        const t = parseInt(todayStat.displayValue)
        if (!isNaN(t)) {
          today = t
        }
      }
      
      // Fallback: derive from the last played round
      if (today === null) {
        let lastRoundIdx = -1
        for (let i = rounds.length - 1; i >= 0; i--) {
          if (rounds[i] !== null) { lastRoundIdx = i; break }
        }
        if (lastRoundIdx >= 0) {
          today = (rounds[lastRoundIdx] as number) - coursePar
        }
      }

      // For cut/wd golfers: score = actual 2-round to-par total
      if ((status === 'cut' || status === 'wd') && rounds[0] !== null && rounds[1] !== null) {
        score = rounds[0] + rounds[1] - coursePar * 2
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today,
        thru,
        status,
        rounds,
        par: coursePar,  // Use actual course par
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
