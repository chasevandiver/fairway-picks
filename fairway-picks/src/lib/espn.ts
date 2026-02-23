import type { GolferScore } from '@/lib/types'

const PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: PAR },
  { name: 'Rory McIlroy',        position: '2',   score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: PAR },
  { name: 'Xander Schauffele',   position: '3',   score: -11, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [69, 70, 68, 71], par: PAR },
  { name: 'Hideki Matsuyama',    position: 'T7',  score: -7,  today: -2, thru: 'F',   status: 'active', rounds: [70, 68, 69, 70], par: PAR },
  { name: 'Patrick Cantlay',     position: '9',   score: -6,  today: 0,  thru: 'F',   status: 'active', rounds: [70, 68, 70, 72], par: PAR },
  { name: 'Justin Rose',         position: '10',  score: -5,  today: -2, thru: 'F',   status: 'active', rounds: [70, 69, 70, 70], par: PAR },
  { name: 'Sam Burns',           position: 'T10', score: -5,  today: -1, thru: 'F',   status: 'active', rounds: [71, 68, 70, 71], par: PAR },
  { name: 'Matt Fitzpatrick',    position: '12',  score: -4,  today: -1, thru: 'F',   status: 'active', rounds: [70, 70, 70, 71], par: PAR },
  { name: 'Max Homa',            position: 'T12', score: -4,  today: 0,  thru: 'F',   status: 'active', rounds: [71, 69, 72, 72], par: PAR },
  { name: 'Min Woo Lee',         position: '14',  score: -3,  today: -1, thru: 'F',   status: 'active', rounds: [71, 70, 70, 72], par: PAR },
  { name: 'Russell Henley',      position: 'T14', score: -3,  today: 0,  thru: 'F',   status: 'active', rounds: [71, 70, 72, 72], par: PAR },
  { name: 'Si Woo Kim',          position: '16',  score: -2,  today: 1,  thru: 'F',   status: 'active', rounds: [71, 71, 71, 73], par: PAR },
  { name: 'Harris English',      position: 'T16', score: -2,  today: -1, thru: 'F',   status: 'active', rounds: [72, 70, 72, 71], par: PAR },
  { name: 'Jake Knapp',          position: '18',  score: -1,  today: 1,  thru: 'F',   status: 'active', rounds: [71, 71, 72, 73], par: PAR },
  { name: 'Chris Gotterup',      position: '19',  score: 0,   today: 0,  thru: 'F',   status: 'active', rounds: [72, 72, 72, 72], par: PAR },
  { name: 'Maverick McNealy',    position: '20',  score: 1,   today: 2,  thru: 'F',   status: 'active', rounds: [72, 73, 72, 74], par: PAR },
  { name: 'Jordan Spieth',       position: '21',  score: 2,   today: 1,  thru: 'F',   status: 'active', rounds: [73, 73, 72, 73], par: PAR },
  { name: 'Jon Rahm',            position: '22',  score: 3,   today: 2,  thru: 'CUT', status: 'cut',    rounds: [75, 72, 75, 72], par: PAR },
  { name: 'Tony Finau',          position: '23',  score: 4,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [74, 74, 74, 74], par: PAR },
  { name: 'Byeong Hun An',       position: '24',  score: 5,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [75, 73, 75, 73], par: PAR },
  { name: 'Rickie Fowler',       position: '25',  score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, 75, 75], par: PAR },
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
        c.status?.period?.toString() ||
        '—'

      // ── Total score to par ──
      const scoreRaw = c.score ?? c.linescores?.slice(-1)?.[0]?.value
      const score: number | null = scoreRaw !== undefined && scoreRaw !== null
        ? parseInt(String(scoreRaw))
        : null

      // ── Thru / today ──
      // ESPN stores per-round data in linescores array
      const lines: any[] = c.linescores || []

      // Find which round is "today" — the last one with a non-null value
      const playedLines = lines.filter((l: any) =>
        l.value !== null && l.value !== undefined && l.displayValue !== '--'
      )
      const lastLine = playedLines[playedLines.length - 1]
      const thruRaw = lastLine?.thru ?? lastLine?.period ?? null
      const thru: string = status === 'cut' ? 'CUT' :
        status === 'wd' ? 'WD' :
        thruRaw !== null ? String(thruRaw) : '—'

      const todayPar = lastLine?.value !== undefined ? parseInt(String(lastLine.value)) : null
      const today: number | null = !isNaN(todayPar as number) ? todayPar : null

      // ── Round-by-round strokes ──
      // ESPN linescores: each entry has a displayValue like "69" (strokes) or "--"
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const dv = l.displayValue
        if (dv && dv !== '--' && dv !== 'E') {
          const n = parseInt(dv)
          if (!isNaN(n) && n > 50) rounds[i] = n  // sanity check: must be > 50 strokes
        }
      })

      // For cut golfers, repeat R1+R2 into R3+R4
      if (status === 'cut') {
        rounds[2] = rounds[0]
        rounds[3] = rounds[1]
      }

      return {
        name: c.athlete?.displayName || 'Unknown',
        position,
        score: score !== null && !isNaN(score) ? score : null,
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
