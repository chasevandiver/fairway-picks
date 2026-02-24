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
  { name: 'Hideki Matsuyama',    position: 'T7',  score: -7,  today: -2, thru: 'F',   status: 'active', rounds: [70, 68, 69, 70], par: PAR },
  { name: 'Patrick Cantlay',     position: '9',   score: -6,  today: 0,  thru: 'F',   status: 'active', rounds: [70, 68, 70, 72], par: PAR },
  { name: 'Justin Rose',         position: '10',  score: -5,  today: -2, thru: 'F',   status: 'active', rounds: [70, 69, 70, 70], par: PAR },
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

    const competitors: GolferScore[] = raw.map((c: any) => {
      // ── Status ──
      const statusRaw = (c.status?.type?.name || '').toLowerCase()
      const status: 'active' | 'cut' | 'wd' =
        statusRaw.includes('cut') ? 'cut' :
        statusRaw.includes('wd')  ? 'wd'  : 'active'

      // ── Position ──
      const position: string =
        c.status?.position?.displayName ||
        c.status?.position?.id ||
        '—'

      // ── Total score to par ──
      // ESPN returns scoreToPar as a stat or in the score field
      const stats: any[] = c.statistics || []
      const scoreToParStat = stats.find((s: any) =>
        s.name === 'scoreToPar' || s.abbreviation === 'SCORE'
      )
      let score: number | null = null
      if (scoreToParStat) {
        const v = parseInt(scoreToParStat.displayValue?.replace('E', '0'))
        if (!isNaN(v)) score = v
      }
      // fallback: c.score is sometimes the total strokes, convert to par
      if (score === null && c.score !== undefined) {
        const raw = parseInt(c.score)
        if (!isNaN(raw)) {
          // if it looks like strokes (60-80 range per round * rounds), convert
          score = raw > 50 ? raw - (PAR * 4) : raw
        }
      }

      // ── Round-by-round linescores ──
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]

      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        // displayValue is raw strokes like "69", value is to-par like "-3"
        const dv = l.displayValue
        if (dv && dv !== '--' && dv !== 'E' && dv !== '') {
          const n = parseInt(dv)
          // Raw strokes are typically between 60-85
          if (!isNaN(n) && n >= 60 && n <= 90) {
            rounds[i] = n
          } else if (!isNaN(n) && Math.abs(n) <= 20) {
            // It's a to-par value, convert to strokes
            rounds[i] = PAR + n
          }
        }
      })

      // ── Thru ──
      const thruStat = stats.find((s: any) => s.name === 'thru' || s.abbreviation === 'THRU')
      const thruVal = thruStat?.displayValue
      const thru: string =
        status === 'cut' ? 'CUT' :
        status === 'wd'  ? 'WD'  :
        thruVal && thruVal !== '--' ? thruVal : '—'

      // ── Today (current round to par) ──
      const todayStat = stats.find((s: any) =>
        s.name === 'toPar' || s.name === 'today' || s.abbreviation === 'TODAY'
      )
      let today: number | null = null
      if (todayStat) {
        const tv = todayStat.displayValue?.replace('E', '0')
        const n = parseInt(tv)
        if (!isNaN(n)) today = n
      }
      // Fallback: derive today from last played round
      if (today === null) {
        const lastRound = [...rounds].reverse().find(r => r !== null)
        if (lastRound !== null && lastRound !== undefined) today = lastRound - PAR
      }

      // For cut/WD golfers: store only actual played rounds (R1, R2, null, null).
      // scoring.ts mirrors R3=R1 and R4=R2 for display, and doubles the score.
      if (status === 'cut' || status === 'wd') {
        rounds[2] = null
        rounds[3] = null
        // score = actual 2-round to-par (NOT doubled — scoring.ts doubles it)
        if (rounds[0] !== null && rounds[1] !== null) {
          score = rounds[0] + rounds[1] - PAR * 2
        }
      }

      return {
        name: c.athlete?.displayName || 'Unknown',
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
