import type { GolferScore } from '@/lib/types'

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',  score: -14, today: -5, thru: 'F',  status: 'active' },
  { name: 'Rory McIlroy',        position: '2',  score: -12, today: -4, thru: 'F',  status: 'active' },
  { name: 'Xander Schauffele',   position: '3',  score: -11, today: -3, thru: 'F',  status: 'active' },
  { name: 'Collin Morikawa',     position: '4',  score: -10, today: -4, thru: 'F',  status: 'active' },
  { name: 'Ludvig Åberg',        position: '5',  score: -9,  today: -2, thru: 'F',  status: 'active' },
  { name: 'Tommy Fleetwood',     position: '6',  score: -8,  today: -3, thru: 'F',  status: 'active' },
  { name: 'Cameron Young',       position: '7',  score: -7,  today: -1, thru: 'F',  status: 'active' },
  { name: 'Hideki Matsuyama',    position: 'T7', score: -7,  today: -2, thru: 'F',  status: 'active' },
  { name: 'Patrick Cantlay',     position: '9',  score: -6,  today: 0,  thru: 'F',  status: 'active' },
  { name: 'Justin Rose',         position: '10', score: -5,  today: -2, thru: 'F',  status: 'active' },
  { name: 'Sam Burns',           position: 'T10',score: -5,  today: -1, thru: 'F',  status: 'active' },
  { name: 'Matt Fitzpatrick',    position: '12', score: -4,  today: -1, thru: 'F',  status: 'active' },
  { name: 'Max Homa',            position: 'T12',score: -4,  today: 0,  thru: 'F',  status: 'active' },
  { name: 'Min Woo Lee',         position: '14', score: -3,  today: -1, thru: 'F',  status: 'active' },
  { name: 'Russell Henley',      position: 'T14',score: -3,  today: 0,  thru: 'F',  status: 'active' },
  { name: 'Si Woo Kim',          position: '16', score: -2,  today: 1,  thru: 'F',  status: 'active' },
  { name: 'Harris English',      position: 'T16',score: -2,  today: -1, thru: 'F',  status: 'active' },
  { name: 'Jake Knapp',          position: '18', score: -1,  today: 1,  thru: 'F',  status: 'active' },
  { name: 'Chris Gotterup',      position: '19', score: 0,   today: 0,  thru: 'F',  status: 'active' },
  { name: 'Maverick McNealy',    position: '20', score: 1,   today: 2,  thru: 'F',  status: 'active' },
  { name: 'Jordan Spieth',       position: '21', score: 2,   today: 1,  thru: 'F',  status: 'active' },
  { name: 'Jon Rahm',            position: '22', score: 3,   today: 2,  thru: 'F',  status: 'cut'    },
  { name: 'Tony Finau',          position: '23', score: 4,   today: 3,  thru: 'F',  status: 'cut'    },
  { name: 'Byeong Hun An',       position: '24', score: 5,   today: 4,  thru: 'F',  status: 'cut'    },
  { name: 'Rickie Fowler',       position: '25', score: 6,   today: 3,  thru: 'F',  status: 'cut'    },
]

export async function fetchLiveScores(): Promise<GolferScore[]> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { next: { revalidate: 120 } }
    )
    if (!res.ok) throw new Error('ESPN fetch failed')
    const data = await res.json()

    const events = data?.events || []
    if (!events.length) return MOCK_DATA

    const competitions = events[0]?.competitions || []
    if (!competitions.length) return MOCK_DATA

    const competitors: GolferScore[] = competitions[0]?.competitors?.map((c: any) => {
      const stats = c.statistics || []
      const score = c.score ? parseInt(c.score) : null
      const todayStat = stats.find((s: any) => s.name === 'scoreToPar')
      const thruStat  = stats.find((s: any) => s.name === 'thru')

      const statusRaw = c.status?.type?.name?.toLowerCase() || ''
      const status: 'active' | 'cut' | 'wd' =
        statusRaw.includes('cut') ? 'cut' :
        statusRaw.includes('wd')  ? 'wd'  : 'active'

      return {
        name: c.athlete?.displayName || 'Unknown',
        position: c.status?.position?.displayName || c.status?.period?.toString() || '—',
        score: score !== null && !isNaN(score) ? score : null,
        today: todayStat ? parseInt(todayStat.displayValue) : null,
        thru: thruStat?.displayValue || (status === 'cut' ? 'CUT' : '—'),
        status,
      } as GolferScore
    }) || []

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch {
    return MOCK_DATA
  }
}

export { MOCK_DATA }
