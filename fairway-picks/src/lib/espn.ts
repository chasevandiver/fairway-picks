import type { GolferScore } from '@/lib/types'

const PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: PAR },
]

function parseCompetitors(raw: any[]): GolferScore[] {
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

  return raw.map((c: any, idx: number) => {
    const statusRaw = (c.status?.type?.name || '').toLowerCase()
    const status: 'active' | 'cut' | 'wd' =
      statusRaw.includes('cut') ? 'cut' :
      statusRaw.includes('wd')  ? 'wd'  : 'active'

    const position = getPosition(idx, statusRaw)

    // c.score is total to-par as a string e.g. "-16"
    let score: number | null = null
    if (c.score !== undefined && c.score !== null) {
      const v = parseFloat(c.score)
      if (!isNaN(v)) score = v
    }

    // linescores: value = raw strokes (63.0), displayValue = to-par ("-7")
    const lines: any[] = c.linescores || []
    const rounds: (number | null)[] = [null, null, null, null]
    lines.forEach((l: any, i: number) => {
      if (i >= 4) return
      const strokes = l.value
      if (strokes !== undefined && strokes !== null) {
        const n = Math.round(strokes)
        if (n >= 55 && n <= 95) rounds[i] = n
      }
    })

    const stats: any[] = c.statistics || []
    const thruStat = stats.find((s: any) => s.name === 'thru' || s.abbreviation === 'THRU')
    const thruVal = thruStat?.displayValue
    const thru: string =
      status === 'cut' ? 'CUT' :
      status === 'wd'  ? 'WD'  :
      thruVal && thruVal !== '--' ? thruVal : '—'

    let today: number | null = null
    let lastRoundIdx = -1
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i] !== null) { lastRoundIdx = i; break }
    }
    if (lastRoundIdx >= 0) today = (rounds[lastRoundIdx] as number) - PAR

    // For cut/wd: score = actual 2-round to-par. DO NOT double — scoring.ts handles adjScore * 2
    if ((status === 'cut' || status === 'wd') && rounds[0] !== null && rounds[1] !== null) {
      score = rounds[0] + rounds[1] - PAR * 2
    }

    return {
      name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
      position, score, today, thru, status, rounds, par: PAR,
    } as GolferScore
  })
}

export async function fetchLiveScores(tournamentName?: string): Promise<GolferScore[]> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error('ESPN fetch failed')
    const data = await res.json()

    const events: any[] = data?.events || []
    if (!events.length) return MOCK_DATA

    // Try to find the event matching the active tournament name
    // Otherwise fall back to the most recent event
    let targetEvent = events[0]
    if (tournamentName) {
      const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const match = events.find((e: any) =>
        normalise(e.name).includes(normalise(tournamentName)) ||
        normalise(tournamentName).includes(normalise(e.name))
      )
      if (match) targetEvent = match
    }

    const competitions = targetEvent?.competitions || []
    if (!competitions.length) return MOCK_DATA
    const raw = competitions[0]?.competitors || []
    if (raw.length < 5) return MOCK_DATA

    const competitors = parseCompetitors(raw)
    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
